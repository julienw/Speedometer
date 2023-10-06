import { createSlice, createSelector } from "@reduxjs/toolkit";
import { SHOW_ALL, SHOW_COMPLETED, SHOW_ACTIVE } from "../constants/todo-filters";

const initialState = {};

function uuid() {
    let uuid = "";
    for (let i = 0; i < 32; i++) {
        const random = (Math.random() * 16) | 0;
        if (i === 8 || i === 12 || i === 16 || i === 20)
            uuid += "-";

        let currentNumber = random;
        if (i === 12)
            currentNumber = 4;
        else if (i === 16)
            currentNumber = 8 | (random & 3);
        uuid += currentNumber.toString(16);
    }
    return uuid;
}

const verbs = ["remember", "pick up", "buy"];
const things = ["the milk", "the butter", "the meat", "fruits", "vegetables", "salt and pepper", "eggs"];
const locations = ["supermarket", "grocery shop", "local market", "organic market"];
const ITEM_COUNT = 100_000;

export const todosSlice = createSlice({
    name: "todos",
    initialState,
    reducers: {
        addTodo: (state, { payload }) => {
            const id = uuid();
            state[id] = { id, text: payload, completed: false };
        },
        deleteTodo: (state, { payload }) => {
            delete state[payload];
        },
        editTodo: (state, { payload }) => {
            state[payload.id].text = payload.text;
        },
        toggleTodo: (state, { payload }) => {
            state[payload].completed = !state[payload].completed;
        },
        toggleAll: (state) => {
            const todos = Object.values(state);
            const areAllMarked = todos.every((todo) => todo.completed);
            todos.forEach((todo) => (todo.completed = !areAllMarked));
        },
        clearCompleted: (state) => {
            for (const id in state) {
                if (state[id].completed)
                    delete state[id];
            }

        },
        generateStateWithLotsOfItems: () => {
            const newState = {};
            for (let i = 0; i < ITEM_COUNT; i++) {
                const verb = verbs[i % verbs.length];
                const thing = things[i % things.length];
                const location = locations[i % locations.length];
                const id = uuid();
                newState[id] = { id, text: `${verb} ${thing} at the ${location}`, completed: false };
            }
            return newState;
        },
    },
});

export const { addTodo, deleteTodo, editTodo, toggleTodo, toggleAll, clearCompleted, generateStateWithLotsOfItems } = todosSlice.actions;
export default todosSlice.reducer;

export const selectTodos = createSelector(
    (state) => state.todos,
    (todos) => Object.values(todos)
);

export const selectVisibleTodos = createSelector(
    selectTodos,
    (state) => state.pathname,
    (todos, pathname) => {
        switch (pathname) {
            case SHOW_ALL:
                return todos;
            case SHOW_COMPLETED:
                return todos.filter((t) => t.completed);
            case SHOW_ACTIVE:
                return todos.filter((t) => !t.completed);
            default:
                throw new Error(`Unknown filter: ${pathname}.`);
        }
    }
);

export const selectCompletedTodos = createSelector(selectTodos, (todos) => todos.filter((t) => t.completed));
