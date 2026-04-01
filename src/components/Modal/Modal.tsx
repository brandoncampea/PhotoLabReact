import React from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  hideDefaultClose?: boolean;
  contentClassName?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, hideDefaultClose = false, contentClassName = '' }) => {
  if (!isOpen) return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay dark-modal-overlay" onClick={onClose}>
      <div className={`modal-content dark-modal-content ${contentClassName}`.trim()} onClick={e => e.stopPropagation()}>
        {children}
        {!hideDefaultClose && (
          <button className="modal-close btn btn-secondary" onClick={onClose}>Close</button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
