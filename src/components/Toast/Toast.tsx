import React from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info' }) => (
  <div className={`toast toast-${type}`}>{message}</div>
);

export default Toast;
