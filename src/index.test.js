import {state, effect} from 'smx';

const delay = (ms = 0, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));

const increaseReducer = (value, {by = 1}) => value + by;
const stateResolver = (state, {stateId}) => state(stateId);

test('simple state & effect', () => {
  const count = state(1);
  const increase = effect(() => [count, increaseReducer]);

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
    subscribe: expect.anything(),
  });

  await delay(15);
  const secondLoadable = count.loadable();
  expect(secondLoadable).not.toBe(firstLoadable);
  expect(secondLoadable).toEqual({
    state: 'hasValue',
    value: 1,
    subscribe: expect.anything(),
  });
});

test('state.loadable() sync', async () => {
  const count = state(1);
  const firstLoadable = count.loadable();

  expect(firstLoadable).toEqual({
    state: 'hasValue',
    value: 1,
    subscribe: expect.anything(),
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
    subscribe: expect.anything(),
  });

  await delay(15);
  const secondLoadable = doSomething.loadable();
  expect(secondLoadable).not.toBe(firstLoadable);
  expect(secondLoadable).toEqual({
    state: 'hasValue',
    value: undefined,
    subscribe: expect.anything(),
  });
});

test('effect.loadable() sync', async () => {
  const doSomething = effect();

  doSomething();

  const firstLoadable = doSomething.loadable();

  expect(firstLoadable).toEqual({
    state: 'hasValue',
    value: undefined,
    subscribe: expect.anything(),
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
