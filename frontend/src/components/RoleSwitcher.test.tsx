import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleProvider } from '@/contexts/RoleContext';
import { RoleSwitcher } from './RoleSwitcher';

function renderWithProvider(ui: React.ReactElement) {
  return render(<RoleProvider>{ui}</RoleProvider>);
}

describe('RoleSwitcher', () => {
  it('renders persona label and select', () => {
    renderWithProvider(<RoleSwitcher />);
    expect(screen.getByLabelText(/persona/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /persona/i })).toBeInTheDocument();
  });

  it('defaults to Bid Manager and allows changing persona', () => {
    renderWithProvider(<RoleSwitcher />);
    const select = screen.getByRole('combobox', { name: /persona/i });
    expect(select).toHaveValue('Bid Manager');
    fireEvent.change(select, { target: { value: 'Reviewer' } });
    expect(select).toHaveValue('Reviewer');
  });
});
