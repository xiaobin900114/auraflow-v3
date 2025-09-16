import { createContext, useContext } from 'react';

export const ToastCtx = createContext({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);
