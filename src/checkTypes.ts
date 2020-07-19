import {effect, state} from './index';

const count1 = state(1);
const count2 = state(2);
const count3 = state(3);
const asyncCount = state(async () => 0);
const increaseReducer = (value, {by = 1}) => value + by;
const increaseCount1 = effect(() => [count1, increaseReducer]);
const increaseCount2 = effect(() => [count2, increaseReducer]);
const increaseCount3 = effect(() => [count3, increaseReducer]);
const callback = jest.fn();
const epic1 = effect(async function* () {
  while (true) {
    const target: any = yield {count1, count2};
    callback(target.value());

    yield [increaseCount3, {by: 2}];
  }
}).run();

const doubleAsyncCount1 = asyncCount.map((value) => value * 2);
const doubleAsyncCount2 = asyncCount.map('hello');
const doubleCount1 = count1.map((value) => value * 2);
const doubleCount2 = count1.map('abc');

console.log(
  epic1,
  doubleAsyncCount1,
  doubleAsyncCount2,
  doubleCount1,
  doubleCount2,
);

const epic2 = effect([count1, 100]).run();
increaseCount1();
increaseCount2();

console.log(epic2);

const doSomething = effect(async () => {});

doSomething();

const firstLoadable = doSomething.loadable();

expect(firstLoadable).toEqual({
  state: 'loading',
  value: undefined,
  subscribe: expect.anything(),
});

const secondLoadable = doSomething.loadable();

console.log(secondLoadable);

const shape = state({
  count1,
  count2,
});

const w1 = state.valueWatcher(asyncCount);
const w2 = state.valueWatcher([asyncCount, asyncCount]);
const w3 = state.loadableWatcher(asyncCount);
const w4 = state.loadableWatcher([asyncCount, asyncCount]);

const ww1 = w1.watch(undefined);
ww1();

w2.watch(undefined);

console.log(shape, w3, w4);
