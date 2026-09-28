import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmationModal
        isOpen={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        title="T"
        message="M"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title, message and default button labels when open', () => {
    render(
      <ConfirmationModal
        isOpen
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        title="Delete?"
        message="Are you sure"
      />,
    );
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Are you sure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('uses custom button labels when provided', () => {
    render(
      <ConfirmationModal
        isOpen
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        title="T"
        message="M"
        confirmButtonText="Yes do it"
        cancelButtonText="No keep it"
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes do it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No keep it' })).toBeInTheDocument();
  });

  it('fires onClose and onConfirm when the buttons are clicked', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    render(
      <ConfirmationModal isOpen onClose={onClose} onConfirm={onConfirm} title="T" message="M" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
