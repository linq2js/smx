import iscope from 'iscope';

const unset = {};
const emptyMap = new Map();
const noop = () => {};
const noSubscribe = () => noop;
const defaultLoadable = createLiteralLoadable(undefined);
const evaluationScope = iscope(() => undefined);
const uniquePropSuffix = new Date().getTime().toString();
const setValueMethodName = '__update' + uniquePropSuffix;
const typePropName = '__smx' + uniquePropSuffix;
const stateType = 1;
const effectType = 2;
const isState = {state: true};
const isEffect = {effect: true};
const isFunction = {function: true};
const isUnknown = {};
const hookTypes = {
  memo: 1,
};

emptyMap.value = unset;

export function state(defaultValue) {
  const initializer =
    typeof defaultValue === 'function' ? defaultValue : () => defaultValue;
  const familyStates = createArrayKeyedMap();
  const defaultState = getFamilyState([]);
  function getFamilyState(args) {
    return familyStates.getOrAdd(args, () => {
      const state = createFamilyState(initializer, args);
      if (args.length) {
        state.remove = () => {
          state.dispose();
          familyStates.delete(args);
        };
      } else {
        // do nothing when removing defaultState
        state.remove = noop;
      }
      return state;
    });
  }

  function impl(...args) {
    // reduce searching time
    if (!args.length) {
      return defaultState;
    }
    return getFamilyState(args);
  }

  return Object.assign(impl, defaultState);
}

Object.assign(state, {
  memo(callback, deps = []) {
    return useStateHook(hookTypes.memo, (hook, data) => {
      if (!data.__memo) {
        data.__memo = createArrayKeyedMap();
      }
      return data.__memo.getOrAdd(deps, () => {
        // avoid calling hook inside callback
        return evaluationScope(null, () => callback());
      });
    });
  },
});

function useStateHook(type, callback) {
  const scope = evaluationScope();
  if (!scope) {
    throw new Error(
      'Don’t call Hooks inside loops, conditions, or nested hooks and outside state evaluation function',
    );
  }
  scope.hookIndex++;
  let hook = scope.hookData[scope.hookIndex];
  if (!hook) {
    scope.hookData[scope.hookIndex] = hook = {type, isNew: true};
  } else if (hook.type !== type) {
    throw new Error('It seems hook calling order has been changed');
  }
  const result = callback(hook, scope.hookData, scope);
  hook.isNew = false;
  return result;
}

export function effect(generator = noop, options = {}) {
  if (Array.isArray(generator)) {
    const generatorResult = generator;
    generator = () => generatorResult;
  }
  let lastCall;
  let latest;
  const epic = createEpic(generator, options);
  const onDispatch = createObservable();

  function impl(payload = {}) {
    let isAsyncResult = false;

    try {
      // create execution context
      const context = {
        isCancelled: false,
        payload,
      };

      lastCall = {
        result: epic(context),
      };

      if (isPromiseLike(lastCall.result)) {
        isAsyncResult = true;
        lastCall.result = lastCall.result.finally(onDispatch.dispatch);

        Object.assign(lastCall.result, {
          cancel() {
            if (context.isCancelled) {
              return;
            }
            context.isCancelled = true;
          },
          isCancelled() {
            return context.isCancelled;
          },
        });
      }

      return lastCall.result;
    } finally {
      if (!isAsyncResult) {
        onDispatch.dispatch();
      }
    }
  }

  Object.assign(impl, {
    [typePropName]: effectType,
    cancel() {
      lastCall &&
        lastCall.result &&
        lastCall.result.cancel &&
        lastCall.result.cancel();
    },
    value() {
      return lastCall ? lastCall.result : void 0;
    },
    loadable() {
      if (!lastCall) {
        return defaultLoadable;
      }

      if (isPromiseLike(lastCall.result)) {
        return createAsyncLoadable(lastCall.result);
      }

      if (!lastCall.loadable) {
        lastCall.loadable = createLiteralLoadable(lastCall.result);
      }

      return lastCall.loadable;
    },
    on: onDispatch.subscribe,
    run(payload) {
      return impl(payload);
    },
    latest() {
      return (
        latest ||
        (latest = function () {
          impl.cancel();
          return impl(...arguments);
        })
      );
    },
    debounce(ms) {
      let timerId;
      return function () {
        clearTimeout(timerId);
        timerId = setTimeout(impl, ms, ...arguments);
      };
    },
    throttle(ms) {
      let lastTime = unset;
      let lastResult;
      return function () {
        const now = new Date().getTime();
        if (lastTime === unset || now - lastTime > ms) {
          lastTime = now;
          return (lastResult = impl(...arguments));
        }
        return lastResult;
      };
    },
  });

  return impl;
}

function createFamilyState(initializer, args) {
  let currentValue = unset;
  let valueHasBeenChanged = false;
  let loadable;
  let isDisposed = false;
  const onChange = createObservable();
  const hookData = [];
  const dependencyStates = new Set();

  function addDependency(state) {
    if (dependencyStates.has(state)) {
      return;
    }
    dependencyStates.add(state);
    state.on(handleDependencyChanged);
  }

  function handleDependencyChanged() {
    if (valueHasBeenChanged) {
      return;
    }
    dependencyStates.clear();
    const prevValue = currentValue;
    currentValue = unset;
    getValue();
    if (currentValue !== prevValue) {
      onChange.dispatch();
    }
  }

  function checkDisposed() {
    if (isDisposed) {
      throw new Error('State has been disposed');
    }
  }

  function reset() {
    checkDisposed();

    valueHasBeenChanged = false;
    handleDependencyChanged();
  }

  function getValue() {
    checkDisposed();

    const dependant = evaluationScope();

    if (dependant) {
      dependant.addDependency(impl);
    }

    if (currentValue === unset) {
      loadable = undefined;
      try {
        currentValue = evaluationScope(
          {hookIndex: 0, hookData, addDependency},
          () => initializer(...args),
        );
      } catch (e) {
        currentValue = new ErrorValue(e);
      }
    }

    if (currentValue instanceof ErrorValue) {
      throw currentValue.error;
    }

    return currentValue;
  }

  function setValue(nextValue) {
    checkDisposed();

    if (typeof nextValue === 'function') {
      // make sure currentValue is set
      getValue();
      try {
        nextValue = nextValue(currentValue);
      } catch (e) {
        nextValue = new ErrorValue(e);
      }
    }

    if (currentValue !== nextValue) {
      valueHasBeenChanged = true;
      dependencyStates.clear();
      currentValue = nextValue;
      onChange.dispatch();
    }
    return nextValue;
  }

  function map(mapper) {
    checkDisposed();

    return state(() => {
      const value = getValue();
      if (isPromiseLike(value)) {
        return value.then(mapper);
      }
      return mapper(value);
    });
  }

  function dispose() {
    if (isDisposed) {
      return;
    }
    isDisposed = true;
    onChange.clear();
    if (isPromiseLike(currentValue) && currentValue.__disposeLoadable) {
      currentValue.__disposeLoadable();
    }
  }

  const impl = {
    [typePropName]: stateType,
    [setValueMethodName]: setValue,
    value: getValue,
    on(listener) {
      checkDisposed();
      return onChange.subscribe(listener);
    },
    reset,
    map,
    dispose,
    loadable() {
      getValue();

      if (isPromiseLike(currentValue)) {
        return createAsyncLoadable(currentValue);
      }
      if (!loadable) {
        loadable = createLiteralLoadable(currentValue);
      }
      return loadable;
    },
  };

  return impl;
}

export function is(obj) {
  if (obj) {
    if (obj[typePropName] === stateType) {
      return isState;
    }
    if (obj[typePropName] === effectType) {
      return isEffect;
    }
  } else if (typeof obj === 'function') {
    return isFunction;
  }
  return isUnknown;
}

function createEpic(generator, options) {
  async function processAsync(ct, iterator, exp) {
    const payload = await processExp(ct, exp);
    if (ct.isCancelled) {
      return;
    }
    const {value, done} = await iterator.next(payload);
    if (done) {
      return;
    }
    return processAsync(ct, iterator, value);
  }

  function processSync(ct, iterator, exp) {
    const result = processExp(ct, exp);

    function next(payload) {
      if (ct.isCancelled) {
        return;
      }
      const {value, done} = iterator.next(payload);
      if (done) {
        return;
      }
      return processSync(ct, iterator, value);
    }

    if (isPromiseLike(result)) {
      return result.then(next);
    }

    return next(result);
  }

  function processExp(ct, exp) {
    // effect/state/function call
    if (Array.isArray(exp)) {
      // await all [{ state1, state2, state3, effect1, effect2, ... }]
      if (exp.length === 1 && typeof exp[0] === 'object') {
        return processAwait(ct, Object.values(exp[0]), true);
      }
      return processModifier(ct, exp);
    }
    const {state, effect} = is(exp);
    if (state || effect) {
      return processAwait(ct, [exp], false);
    }

    // await any state changed or effect dispatched
    if (typeof exp === 'object') {
      return processAwait(ct, Object.values(exp), false);
    }

    throw new Error('Not support yield expression: ' + typeof exp);
  }

  function processAwait(ct, targets, all) {
    const removeListeners = [];
    const promises = targets.map((target) => {
      return new Promise((resolve) => {
        const removeListener = target.on(() => {
          removeListener();
          if (ct.isCancelled) {
            return;
          }
          resolve(target);
        });
        removeListeners.push(removeListener);
      });
    });

    return all
      ? Promise.all(promises)
      : Promise.race(promises)
          // cleanup listeners
          .finally(() => {
            removeListeners.forEach((removeListener) => removeListener());
          });
  }

  function processModifier(ct, exp) {
    // multiple modifiers
    if (Array.isArray(exp[0])) {
      const promises = [];
      exp.forEach((exp) => {
        const result = processModifier(ct, exp);
        if (isPromiseLike(result)) {
          promises.push(result);
        }
      });
      return promises.length ? Promise.all(promises) : void 0;
    }
    const [target, ...args] = exp;
    const targetIs = is(target);
    const payload = args[0];

    // call effect
    if (targetIs.effect) {
      return target(payload);
    }

    if (targetIs.state) {
      let state = target;
      // mutate state using reducer
      if (typeof payload === 'function') {
        const isRootState = typeof state === 'function';
        const reducer = payload;
        const resolver = args[1] || options.stateResolver;
        // resolve state if
        if (isRootState && resolver) {
          state = resolver(state, ct.payload) || state;
        }
        return state[setValueMethodName]((prevValue) =>
          isPromiseLike(prevValue)
            ? prevValue.then((value) =>
                reducer(value, ct.payload, ...args.slice(1)),
              )
            : reducer(prevValue, ct.payload, ...args.slice(1)),
        );
      }
      return state[setValueMethodName](payload);
    }
    // is normal function
    if (typeof target === 'function') {
      return target(...args);
    }
    throw new Error('Not support yield expression: ' + typeof target);
  }

  return function (ct) {
    const result = generator(ct.payload);
    // is iterator
    if (result && typeof result.next === 'function') {
      let iteratorResult;
      let isAsyncResult;
      try {
        const firstResult = result.next();

        if (isPromiseLike(firstResult)) {
          iteratorResult = firstResult.then(
            ({done, value}) => !done && processAsync(ct, result, value),
          );
        } else {
          const {done, value} = firstResult;
          if (done) {
            return;
          }
          iteratorResult = processSync(ct, result, value);
        }

        if (isPromiseLike(iteratorResult)) {
          isAsyncResult = true;

          if (options.success || options.done || options.error) {
            iteratorResult
              .then(
                (result) => {
                  options.success &&
                    processModifier(ct, [options.success, result]);
                },
                (error) => {
                  return (
                    options.error && processModifier(ct, [options.error, error])
                  );
                },
              )
              .finally(() => {
                options.done && processModifier(ct, [options.done]);
              });
          }
        } else {
          options.success &&
            processModifier(ct, [options.success, iteratorResult]);
        }

        return iteratorResult;
      } catch (error) {
        if (options.error) {
          processModifier(ct, [options.error, error]);
        } else {
          throw error;
        }
      } finally {
        if (!isAsyncResult) {
          options.done && processModifier(ct, [options.done]);
        }
      }
    } else if (result) {
      function handleSyncResult(result) {
        if (!result) {
          return;
        }
        if (!Array.isArray(result)) {
          throw new Error(
            'Invalid generator result. It should be tuple [State|Effect|Function, ...args]',
          );
        }
        return processModifier(ct, result);
      }

      if (isPromiseLike(result)) {
        return result.then(handleSyncResult);
      }

      return handleSyncResult(result);
    }
  };
}

function createAsyncLoadable(promise) {
  if (promise.__loadable) {
    return promise.__loadable;
  }
  const {subscribe, dispatch, clear} = createObservable();
  const loadable = (promise.__loadable = {
    state: 'loading',
    subscribe,
  });

  promise.__disposeLoadable = clear;

  promise
    .then(
      (payload) => {
        promise.__loadable = createLiteralLoadable(payload);
      },
      (error) => {
        promise.__loadable = createLiteralLoadable(undefined, error);
      },
    )
    .finally(() => {
      try {
        dispatch();
      } finally {
        clear();
        delete promise.__disposeLoadable;
      }
    });
  return loadable;
}

function createLiteralLoadable(value, error) {
  if (value instanceof Error) {
    return {
      state: 'hasError',
      error: value,
      subscribe: noSubscribe,
    };
  }
  if (error) {
    return {
      state: 'hasError',
      error,
      subscribe: noSubscribe,
    };
  }
  return {
    state: 'hasValue',
    value,
    subscribe: noSubscribe,
  };
}

/**
 * check an obj is promise like or not
 * @param obj
 * @return {*|boolean}
 */
function isPromiseLike(obj) {
  return obj && typeof obj.then === 'function';
}

function createObservable() {
  const subscriptions = new Set();

  function subscribe(subscription) {
    subscriptions.add(subscription);
    return function () {
      subscriptions.delete(subscription);
    };
  }

  function clear() {
    subscriptions.clear();
  }

  function dispatch(...args) {
    for (const subscription of subscriptions) {
      subscription.apply(null, args);
    }
  }

  return {
    dispatch,
    subscribe,
    clear,
  };
}

function createArrayKeyedMap() {
  const root = new Map();
  const values = [];
  root.value = unset;

  function getMap(key, createIfNotExist) {
    const keyArray = Array.isArray(key) ? key : [key];
    let prev = root;
    for (let i = 0; i < keyArray.length; i++) {
      const item = keyArray[i];
      const map = prev.get(item);
      if (typeof map === 'undefined') {
        if (!createIfNotExist) {
          return emptyMap;
        }
        const newMap = new Map();
        newMap.value = unset;
        prev.set(item, newMap);
        prev = newMap;
      } else {
        prev = map;
      }
    }
    return prev;
  }

  return {
    set(key, value) {
      const map = getMap(key, true);
      if (map.value === unset) {
        values[values.length] = map;
      }
      map.value = value;
    },
    get(key) {
      const value = getMap(key, false).value;
      return value === unset ? undefined : value;
    },
    getOrAdd(key, creator) {
      const map = getMap(key, true);
      if (map.value === unset) {
        map.value = creator(key);
        values[values.length] = map;
      }
      return map.value;
    },
    clear() {
      root.clear();
    },
    delete(key) {
      getMap(key, false).value = unset;
    },
    *values() {
      for (const map of values) {
        yield map.value;
      }
    },
  };
}

class ErrorValue {
  constructor(error) {
    this.error = error;
  }
}
