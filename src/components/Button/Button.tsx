import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ children, onClick, type = 'button', className = '', disabled = false }) => (
  <button
    type={type}
    className={`btn btn-primary ${className}`.trim()}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

export default Button;
