import { configureStore } from "@reduxjs/toolkit";

export const store = configureStore({
  reducer: (state = {}) => state
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
