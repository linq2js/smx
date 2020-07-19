# smx

## Create todo app

### Create states

```jsx harmony
// app/states.js
import {state} from 'smx';
// create todoListState with empty array as default value
export const todoListState = state([]);
```

## Define effects to mutate todoListState

```jsx harmony
// app/effects.js
import {effect} from 'smx';
import {todoListState} from './states';

export const addTodo = effect(
  // effect body is just tuple [state, reducer]
  [
    // specific state need to be mutated
    todoListState,
    // state reducer
    (
      // current state
      state,
      // effect payload
      {text},
    ) =>
      // return next state
      // keep state is immutable
      state.concat({
        id: Math.random(),
        text,
        completed: false,
      }),
  ],
);

export const removeTodo = effect([
  todoListState,
  (state, {id}) => state.filter((x) => x.id !== id),
]);

export const toggleTodo = effect([
  todoListState,
  (state, {id}) =>
    state.map((x) => (x.id === id ? {...x, completed: !x.completed} : x)),
]);
```

## Define filtered todo state

```jsx harmony
import {state} from 'smx';
export const filteredTodoListState = state((filter) => {
  // access todos from todoListState
  // that means when todoListState changed, filteredTodoListState will change as well
  const todos = todoListState.value();

  switch (filter) {
    case 'active':
      return todos.filter((x) => !x.completed);
    case 'completed':
      return todos.filter((x) => x.completed);
    default:
      return todos;
  }
});

// using state(arg1, arg2, ...argN) to get state family
// active todos
console.log(filteredTodoListState('active').value());
// completed todos
console.log(filteredTodoListState('completed').value());
```

## Loading todo list from server

```jsx harmony
// convert todoListState to async state
import {state} from 'smx';
// create todoListState with empty array as default value
export const todoListState = state(
  // if we poss async function to state factory, it will create async state
  async () => {
    const data = fetch('api_url').then((res) => res.json());
    return data;
  },
);
console.log(todoListState.value()); // Promise of todo array
// we should update filteredTodoListState
export const filteredTodoListState = state(async (filter) => {
  const todos = await todoListState.value();

  switch (filter) {
    case 'active':
      return todos.filter((x) => !x.completed);
    case 'completed':
      return todos.filter((x) => x.completed);
    default:
      return todos;
  }
});
```

## Handling todoListState changing

```jsx harmony
import {todoListState} from './states';

todoListState.on(({value}) => console.log('todo-list changed', value));
```

## Handling effects triggering

```jsx harmony
import {addTodo} from './effects';

addTodo.on(() => console.log('add-todo triggered'));
```

## Display useful info

```jsx harmony
const countMapper = (todos) => todos.length;
// using map(mapper) to create new state that map current state value to new value.
// When original state changed, mapped state value changed as well
const todoCountState = todoListState.map(countMapper);
// using mapAll(mapper) to apply mapper to all state family
const filteredTodoCountState = filteredTodoListState.mapAll(countMapper);

console.log(await countMapper.value()); // display number of all todos
console.log(await filteredTodoCountState('active').value()); // display number active todos
console.log(await filteredTodoCountState('completed').value()); // display number completed todos
```
