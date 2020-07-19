import fetch from 'node-fetch';
import {state, effect} from 'smx';

const delay = (ms = 0, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));

const increaseReducer = (value, {by = 1}) => value + by;
const stateResolver = (state, {stateId}) => state(stateId);

test('simple state & effect', () => {
  const count = state(1);
  const increase = effect([count, increaseReducer]);

  expect(count.value()).toBe(1);

  increase();
  increase();
  increase({by: 5});

  expect(count.value()).toBe(8);
});

test('sync generator', () => {
  const count1 = state(1);
  const count2 = state(2);
  const count3 = state(3);
  const callback = jest.fn();
  const otherEffect = effect(callback);
  const increase = effect([
    [count1, 2],
    [count2, 3],
    [count3, (value) => value + 1],
    [otherEffect, {data: true}],
  ]);

  // when increase is called, count1 and count2 must be mutated and otherEffect must be called
  increase();

  expect(count1.value()).toBe(2);
  expect(count2.value()).toBe(3);
  expect(count3.value()).toBe(4);
  expect(callback).toBeCalledWith({data: true});
});

test('async generator', async () => {
  const count = state(0);
  const increase = effect(async () => {
    await delay(5);
    return [count, (value) => value + 1];
  });

  await increase();

  expect(count.value()).toBe(1);
});

test('await effect or state', async () => {
  const count1 = state(1);
  const count2 = state(2);
  const count3 = state(3);
  // re-use increaseReducer reducer for multiple states
  const increaseCount1 = effect([count1, increaseReducer]);
  const increaseCount2 = effect([count2, increaseReducer]);
  const increaseCount3 = effect([count3, increaseReducer]);
  const callback = jest.fn();
  const epic = effect(function* () {
    // create a forever loop to listen states changed
    while (true) {
      // listen count1 or count2 changed
      const changedState = yield {count1, count2};
      // receive value from changed state
      callback(changedState.value());
      // call increaseCount3 effect with payload { by: 2 }
      yield [increaseCount3, {by: 2}];
    }
  }).run();
  increaseCount1();
  await delay();
  expect(callback).toBeCalledWith(2);
  expect(count3.value()).toBe(5);
  increaseCount2();
  await delay();
  expect(callback).toBeCalledWith(3);
  expect(count3.value()).toBe(7);
  epic.cancel();
  increaseCount1();
  increaseCount1();
  await delay();
  expect(callback).toBeCalledTimes(2);
  expect(count3.value()).toBe(7);
});

test('handle error using options.error', () => {
  const handleError = jest.fn();
  const handleDone = jest.fn();
  const epic = effect(
    function* () {
      throw new Error('test');
    },
    {
      error: handleError,
      done: handleDone,
    },
  );
  epic();
  expect(handleError).toBeCalled();
  expect(handleDone).toBeCalled();
});

test('handle success, done using options.success and options.done', async () => {
  const handleSuccess = jest.fn();
  const handleDone = jest.fn();
  const epic = effect(
    async function* () {
      await delay(10);
    },
    {
      done: handleDone,
      success: handleSuccess,
    },
  );
  epic();
  await delay(15);
  expect(handleDone).toBeCalled();
  expect(handleSuccess).toBeCalled();
});

test('state dependencies', () => {
  const count = state(1);
  const doubleCount = state(() => count.value() * 2);
  const increase = effect([count, (value) => value + 1]);

  expect(doubleCount.value()).toBe(2);

  increase();

  expect(doubleCount.value()).toBe(4);
});

test('async state', async () => {
  const count = state(async () => {
    await delay(5);
    return 1;
  });
  const doubleCount = state(async () => {
    const resolvedCount = await count.value();
    return resolvedCount * 2;
  });
  const increase = effect([count, (value) => value + 1]);
  await expect(doubleCount.value()).resolves.toBe(2);

  increase();

  await expect(doubleCount.value()).resolves.toBe(4);
});

test('effect.latest()', async () => {
  const callback = jest.fn();
  const longPoolingEffect = effect(async function* () {
    yield [delay, 5];
    yield [callback];
    yield [delay, 5];
    yield [callback];
  }).latest();
  longPoolingEffect();
  longPoolingEffect();
  longPoolingEffect();
  await delay(20);
  expect(callback).toBeCalledTimes(2);
});

test('effect.debounce()', async () => {
  const callback = jest.fn();
  const longPoolingEffect = effect(async function* () {
    yield [delay, 5];
    yield [callback];
    yield [delay, 5];
    yield [callback];
  }).debounce(10);
  longPoolingEffect();
  await delay(5);
  longPoolingEffect();
  await delay(5);
  longPoolingEffect();
  await delay(30);
  expect(callback).toBeCalledTimes(2);
});

test('await effect chain', async () => {
  const callback = jest.fn();
  const step1 = effect();
  const step2 = effect();
  const step3 = effect();
  const longPoolingEffect = effect(async function* () {
    // waiting for multiple steps using yield*
    yield* [step1, step2, step3];
    callback();
  });

  longPoolingEffect();
  await delay(5);
  expect(callback).toBeCalledTimes(0);
  step1();
  await delay(5);
  expect(callback).toBeCalledTimes(0);
  step2();
  await delay(5);
  expect(callback).toBeCalledTimes(0);
  step3();
  await delay(5);
  expect(callback).toBeCalledTimes(1);
});

test('await all effects', async () => {
  const callback = jest.fn();
  const step1 = effect();
  const step2 = effect();
  const step3 = effect();
  const longPoolingEffect = effect(async function* () {
    while (true) {
      // waiting for multiple steps using [{}] (Object In Array structure)
      yield [{step1, step2, step3}];
      callback();
    }
  });

  longPoolingEffect();

  await delay(5);

  expect(callback).toBeCalledTimes(0);
  step3();
  step3();
  await delay(5);
  expect(callback).toBeCalledTimes(0);
  step1();
  await delay(5);
  expect(callback).toBeCalledTimes(0);
  step2();
  await delay(5);

  expect(callback).toBeCalledTimes(1);
  step2();
  step3();
  await delay(5);
  expect(callback).toBeCalledTimes(1);
  step2();
  await delay(5);
  expect(callback).toBeCalledTimes(1);
  step1();
  await delay(5);

  expect(callback).toBeCalledTimes(2);
});

test('state family', () => {
  const family = state((initial) => initial);
  const count1 = family(1);
  const count2 = family(2);

  expect(count1).toBe(family(1));
  expect(count2).toBe(family(2));

  const increase1 = effect([family, increaseReducer, stateResolver]);
  const increase2 = effect([family, increaseReducer], {stateResolver});

  expect(count1.value()).toBe(1);
  expect(count2.value()).toBe(2);
  increase1({stateId: 1});
  increase2({stateId: 2});
  expect(count1.value()).toBe(2);
  expect(count2.value()).toBe(3);
});

test('state.map()', () => {
  const count = state(1);
  const doubleCount = count.map((value) => value * 2);
  const increase = effect([count, increaseReducer]);

  expect(doubleCount.value()).toBe(2);
  increase();
  expect(doubleCount.value()).toBe(4);
});

test('state.loadable() async', async () => {
  const count = state(async () => {
    await delay(10);
    return 1;
  });
  const firstLoadable = count.loadable();

  expect(firstLoadable).toEqual({
    state: 'loading',
    value: undefined,
    on: expect.anything(),
  });

  await delay(15);
  const secondLoadable = count.loadable();
  expect(secondLoadable).not.toBe(firstLoadable);
  expect(secondLoadable).toEqual({
    state: 'hasValue',
    value: 1,
    on: expect.anything(),
  });
});

test('state.loadable() sync', async () => {
  const count = state(1);
  const firstLoadable = count.loadable();

  expect(firstLoadable).toEqual({
    state: 'hasValue',
    value: 1,
    on: expect.anything(),
  });

  await delay(15);
  const secondLoadable = count.loadable();
  expect(secondLoadable).toBe(firstLoadable);
});

test('effect.loadable() async', async () => {
  const doSomething = effect(async () => {
    await delay(10);
  });

  doSomething();

  const firstLoadable = doSomething.loadable();

  expect(firstLoadable).toEqual({
    state: 'loading',
    value: undefined,
    on: expect.anything(),
  });

  await delay(15);
  const secondLoadable = doSomething.loadable();
  expect(secondLoadable).not.toBe(firstLoadable);
  expect(secondLoadable).toEqual({
    state: 'hasValue',
    value: undefined,
    on: expect.anything(),
  });
});

test('effect.loadable() sync', async () => {
  const doSomething = effect();

  doSomething();

  const firstLoadable = doSomething.loadable();

  expect(firstLoadable).toEqual({
    state: 'hasValue',
    value: undefined,
    on: expect.anything(),
  });

  await delay(15);
  const secondLoadable = doSomething.loadable();
  expect(secondLoadable).toBe(firstLoadable);
});

test('state.memo()', () => {
  let value1 = 1;
  let value2 = 2;
  const sum = state((index) => {
    const v1 = state.memo(() => value1);
    const v2 = state.memo(() => value2, [index]);
    return v1 + v2;
  });

  expect(sum.value()).toBe(3);
  value1 = 2;
  value2 = 3;
  // sum of other is diff with default sum because it depend on value of index
  expect(sum('other').value()).toBe(5);
  // default sum is still 3
  expect(sum.value()).toBe(3);
});

test('got error if call hook inside other hook', () => {
  const count = state(() => {
    state.memo(() => {
      state.memo(() => 1);
    });
  });

  expect(count.value).toThrow(
    'Don’t call Hooks inside loops, conditions, or nested hooks and outside state evaluation function',
  );
});

test('compound state', () => {
  const formData = state({
    field1: 1,
    field2: 2,
    field3: 3,
  });

  const fieldData = state(
    (field) => {
      return formData.value()[field];
    },
    (field) => (value) => [
      formData,
      (prevValue) => ({
        ...prevValue,
        [field]: value,
      }),
    ],
  );

  const updateField = effect(({field, value}) => [fieldData(field), value]);

  expect(fieldData('field1').value()).toBe(1);
  expect(fieldData('field2').value()).toBe(2);

  updateField({field: 'field1', value: 2});
  updateField({field: 'field2', value: 3});

  expect(fieldData('field1').value()).toBe(2);
  expect(fieldData('field2').value()).toBe(3);

  expect(formData.value()).toEqual({
    field1: 2,
    field2: 3,
    field3: 3,
  });
});

test('state shape', () => {
  const username = state('admin');
  const password = state('123456');
  const passwordChanged = jest.fn();
  const usernameChanged = jest.fn();

  const userProfile = state({
    username,
    password,
  });
  const updateUserProfile = effect(({username, password}) => [
    userProfile,
    {username, password},
  ]);

  const changePassword = effect([
    password,
    (value, payload) => payload.password,
  ]);

  username.on(usernameChanged);
  password.on(passwordChanged);

  expect(userProfile.value()).toEqual({
    username: 'admin',
    password: '123456',
  });

  changePassword({password: '123'});

  // when password is changed, userProfile.password must be changed too
  expect(userProfile.value()).toEqual({
    username: 'admin',
    password: '123',
  });

  updateUserProfile({
    username: 'admin',
    password: '654321',
  });

  expect(usernameChanged).toBeCalledTimes(0);
  expect(passwordChanged).toBeCalledTimes(2);

  expect(userProfile.value()).toEqual({
    username: 'admin',
    password: '654321',
  });
});

test('state middleware', () => {
  const callback = jest.fn();
  const removeMiddleware = state.use((state) => (next) => {
    callback(state.value());
    return next(state.extend());
  });

  state(1);

  removeMiddleware();

  expect(callback).toBeCalledWith(1);
});

test('effect middleware', () => {
  const callback = jest.fn();
  const count = state(1);
  const removeMiddleware = effect.use((effect) => (next) => {
    return next(
      effect.extend({
        run(payload) {
          callback(payload);
          return effect(payload);
        },
      }),
    );
  });

  const increase = effect([count, (value, {by}) => value + by]);

  increase({by: 100});

  removeMiddleware();

  expect(callback).toBeCalledWith({by: 100});
  expect(count.value()).toBe(101);
});

test('effect api', async () => {
  const apis = {
    'todo-1': 'https://jsonplaceholder.typicode.com/todos/100',
    'todo-2': 'https://jsonplaceholder.typicode.com/todos/101',
  };
  const removeMiddleware = effect.use((effect) => (next) => {
    return next(
      effect.extend({
        run(payload) {
          if (payload.$api) {
            const {$api, $error, ...props} = payload;
            return fetch(apis[$api])
              .then((res) => res.json())
              .then((result) =>
                effect({
                  ...result,
                  ...props,
                }),
              );
          }
          return effect(payload);
        },
      }),
    );
  });
  const callback = jest.fn();
  const getTodo = effect(callback);
  try {
    await getTodo({$api: 'todo-1'});
    await getTodo({$api: 'todo-2'});
  } finally {
    removeMiddleware();
  }

  expect(callback.mock.calls).toEqual([
    [
      {
        userId: 5,
        id: 100,
        title: 'excepturi a et neque qui expedita vel voluptate',
        completed: false,
      },
    ],
    [
      {
        userId: 6,
        id: 101,
        title: 'explicabo enim cumque porro aperiam occaecati minima',
        completed: false,
      },
    ],
  ]);
});

test('sync state', async () => {
  const asyncState = state(
    async () => {
      await delay(5);
      return 10;
    },
    {defaultValue: 0},
  );
  const allAsyncState = asyncState.all();
  const changeState = effect((payload) => [payload.state, delay(5, 11)]);
  const syncState = asyncState.sync();
  const allSyncState = asyncState.allSync();

  expect(syncState.value()).toBe(0);
  expect(allAsyncState.value().length).toBe(1);
  expect(allSyncState.value()).toEqual([]);
  await delay(10);
  expect(syncState.value()).toBe(10);
  expect(allSyncState.value()).toEqual([10]);
  changeState({state: asyncState});
  expect(syncState.value()).toBe(10);
  expect(allSyncState.value()).toEqual([10]);
  await delay(10);
  expect(syncState.value()).toBe(11);
  expect(allAsyncState.value().length).toBe(2);
  expect(allSyncState.value()).toEqual([10, 11]);

  expect(() => changeState({state: syncState})).toThrow(
    'Cannot update readonly state',
  );
});

test('promise chaining', async () => {
  const countState = state(async () => 1);
  const increase = effect([countState, (value) => value + 1]);

  for (let i = 0; i < 10000; i++) {
    await increase();
  }

  await expect(countState.value()).resolves.toBe(10001);
});

test('watchers', async () => {
  const s1 = state(1);
  const s2 = state(2);
  const s3 = state(async () => 3);
  const changeState = effect((payload) => [payload.state, payload.value]);
  const promiseResolver = jest.fn();
  const onChange = jest.fn();
  const onLoadableChange = jest.fn();
  const w1 = state.valueWatcher([s1, s2, s3], undefined, promiseResolver);
  const w2 = state.valueWatcher([s1, s2, s3], w1, promiseResolver);
  const w3 = state.valueWatcher([s1, s2]);
  const w4 = state.loadableWatcher([s1, s2, s3]);

  // should not create new watcher if prevInstance.targets and new targets are the same
  expect(w2).toBe(w1);
  expect(w2).not.toBe(w3);

  const ww1 = w1.watch(onChange);
  const ww3 = w3.watch(onChange);
  const ww4 = w4.watch(onLoadableChange);

  w1.get();
  expect(w1.get()).toEqual([1, 2, undefined]);
  expect(w3.get()).toEqual([1, 2]);
  expect(w4.get().map(({state, value}) => [state, value])).toEqual([
    ['hasValue', 1],
    ['hasValue', 2],
    ['loading', undefined],
  ]);
  expect(promiseResolver).toBeCalledTimes(2);

  await delay();
  expect(onLoadableChange).toBeCalledTimes(1);
  expect(w4.get().map(({state, value}) => [state, value])).toEqual([
    ['hasValue', 1],
    ['hasValue', 2],
    ['hasValue', 3],
  ]);

  changeState({state: s1, value: 2});
  changeState({state: s2, value: 3});

  expect(w1.get()).toEqual([2, 3, 3]);
  expect(w3.get()).toEqual([2, 3]);

  expect(promiseResolver).toBeCalledTimes(2);
  expect(onChange).toBeCalledTimes(4);

  ww1();
  ww3();

  changeState({state: s1, value: 2});
  changeState({state: s2, value: 3});

  // after unwatch, onChange should not be called any more
  expect(onChange).toBeCalledTimes(4);
});

test('mapAll()', () => {
  const count = state((value) => value);
  const doubleCount = count.mapAll((value) => value * 2);
  const increase = effect((payload) => [payload.state, (value) => value + 1]);

  expect(doubleCount(5).value()).toBe(10);
  expect(doubleCount(10).value()).toBe(20);

  increase({state: count(5)});
  increase({state: count(10)});

  expect(doubleCount(5).value()).toBe(12);
  expect(doubleCount(10).value()).toBe(22);
});
