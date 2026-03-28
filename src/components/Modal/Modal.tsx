import React from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay dark-modal-overlay" onClick={onClose}>
      <div className="modal-content dark-modal-content" onClick={e => e.stopPropagation()}>
        {children}
        <button className="modal-close btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
