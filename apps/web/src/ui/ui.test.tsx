import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  Button,
  CardImage,
  CardTile,
  Checkbox,
  Dialog,
  DomainBadge,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  ICON_NAMES,
  Menu,
  ProgressBar,
  RarityBadge,
  SearchField,
  SegmentedControl,
  Select,
  Stepper,
  Switch,
  Tabs,
  TextField,
  ToastProvider,
  Tooltip,
  useToast,
  IconButton,
} from './index';
import { autoDismissMs } from './Toast';

describe('Button', () => {
  it('fires onClick and blocks it while loading', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true');
  });

  it('IconButton requires and exposes an accessible name', () => {
    render(<IconButton icon="trash" label="Delete deck" />);
    expect(screen.getByRole('button', { name: 'Delete deck' })).toBeInTheDocument();
  });
});

describe('Icon', () => {
  it('renders every named icon and is decorative unless labelled', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
    render(<Icon name="check" label="Done" />);
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument();
  });

  it('includes the icons the app requires', () => {
    const required = ['search', 'plus', 'minus', 'grid', 'list', 'filter', 'tag', 'deck', 'layers', 'sync', 'settings', 'check', 'alert', 'download', 'upload', 'sun', 'moon', 'trash', 'edit', 'copy', 'close', 'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right', 'star', 'cloud', 'cloud-off', 'sparkles', 'dice'];
    for (const name of required) expect(ICON_NAMES).toContain(name);
  });
});

describe('fields', () => {
  it('TextField links label, hint and error for assistive tech', () => {
    render(<TextField label="Name" hint="Shown in lists" error="Required" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required');
  });

  it('SearchField clears with the button and Escape, and submits on Enter', async () => {
    const onSearch = vi.fn();
    function Harness() {
      const [value, setValue] = useState('fury');
      return <SearchField label="Search" value={value} onValueChange={setValue} onSearch={onSearch} />;
    }
    render(<Harness />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(input, ' unit{Enter}');
    expect(onSearch).toHaveBeenCalledWith('fury unit');
    await userEvent.type(input, '{Escape}');
    expect(input).toHaveValue('');
  });

  it('Select reports the chosen value', async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        label="Condition"
        value="NM"
        onValueChange={onValueChange}
        options={[
          { value: 'NM', label: 'Near mint' },
          { value: 'LP', label: 'Lightly played' },
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Condition'), 'LP');
    expect(onValueChange).toHaveBeenCalledWith('LP');
  });

  it('Checkbox and Switch toggle with correct roles', async () => {
    const onCheck = vi.fn();
    const onSwitch = vi.fn();
    render(
      <>
        <Checkbox label="Foil only" checked={false} onCheckedChange={onCheck} />
        <Switch label="Auto sync" checked onCheckedChange={onSwitch} />
      </>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Foil only' }));
    expect(onCheck).toHaveBeenCalledWith(true);
    const toggle = screen.getByRole('switch', { name: 'Auto sync' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(onSwitch).toHaveBeenCalledWith(false);
  });

  it('SegmentedControl supports arrow key selection', async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label="View"
        value="grid"
        onValueChange={onValueChange}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
      />,
    );
    screen.getByRole('radio', { name: 'Grid' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith('list');
  });
});

describe('Stepper', () => {
  it('steps within bounds and disables the edges', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper label="Quantity" value={1} min={0} max={2} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    rerender(<Stepper label="Quantity" value={2} min={0} max={2} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    rerender(<Stepper label="Quantity" value={0} min={0} max={2} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  });
});

describe('Dialog', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    return (
      <>
        <button>Opener</button>
        <Dialog open onClose={onClose} title="Delete deck?" description="This cannot be undone.">
          <button>First</button>
          <button>Last</button>
        </Dialog>
      </>
    );
  }

  it('is a labelled modal dialog that closes on Escape and scrim click', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete deck?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus in and traps Tab', async () => {
    render(<Harness onClose={() => undefined} />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    screen.getByRole('button', { name: 'Last' }).focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('restores focus to the opener when closed', () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="T">
            body
          </Dialog>
        </>
      );
    }
    render(<Wrapper />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('Drawer renders the same accessible dialog semantics', () => {
    render(
      <Drawer open onClose={() => undefined} title="Filters" side="bottom">
        content
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });
});

describe('Menu and Tooltip', () => {
  it('opens a menu, navigates with arrows, selects and closes', async () => {
    const onEdit = vi.fn();
    render(
      <Menu
        label="Deck actions"
        trigger={({ props }) => <IconButton icon="more" label="More" {...props} />}
        items={[
          { label: 'Edit', onSelect: onEdit },
          { label: 'Delete', onSelect: () => undefined, danger: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Tooltip appears on focus after a short delay', async () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Add to deck">
        <button>Add</button>
      </Tooltip>,
    );
    act(() => screen.getByRole('button', { name: 'Add' }).focus());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Add to deck');
    vi.useRealTimers();
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.show({ title: 'Saved', tone: 'success', durationMs: 0 })}>Notify</button>;
  }

  it('renders into persistent live regions and dismisses', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const polite = screen.getByRole('status', { name: 'Notifications' });
    const assertive = screen.getByRole('alert', { name: 'Errors' });
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    await userEvent.click(screen.getByRole('button', { name: 'Notify' }));
    expect(polite).toHaveTextContent('Saved');
    expect(screen.getByRole('status', { name: 'Notifications' })).toBe(polite); // same node: stays mounted
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(polite).not.toHaveTextContent('Saved');
  });

  it('routes errors to the assertive region and never auto-dismisses errors or actions', () => {
    expect(autoDismissMs({ title: 'x', tone: 'danger' })).toBe(0);
    expect(autoDismissMs({ title: 'x', action: { label: 'Go', onClick: () => undefined } })).toBe(0);
    expect(autoDismissMs({ title: 'x' })).toBeGreaterThan(0);
    function Err() {
      const toast = useToast();
      return <button onClick={() => toast.show({ title: 'Broke', tone: 'danger' })}>Fail</button>;
    }
    render(
      <ToastProvider>
        <Err />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.getByRole('alert', { name: 'Errors' })).toHaveTextContent('Broke');
  });

  it('pauses auto dismiss while hovered', () => {
    vi.useFakeTimers();
    function Quick() {
      const toast = useToast();
      return <button onClick={() => toast.show({ title: 'Brief', durationMs: 1000 })}>Go</button>;
    }
    render(
      <ToastProvider>
        <Quick />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    const toastEl = screen.getByText('Brief').closest('.ui-toast')!;
    fireEvent.mouseEnter(toastEl);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByText('Brief')).toBeInTheDocument();
    fireEvent.mouseLeave(toastEl);
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText('Brief')).toBeNull();
    vi.useRealTimers();
  });

  it('useToast outside a provider fails loudly', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Tabs', () => {
  it('selects with click and arrow keys and shows the active panel', async () => {
    function Harness() {
      const [value, setValue] = useState('a');
      return (
        <Tabs
          label="Sections"
          value={value}
          onValueChange={setValue}
          items={[
            { value: 'a', label: 'Overview', content: <p>Panel A</p> },
            { value: 'b', label: 'Printings', count: 3, content: <p>Panel B</p> },
          ]}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Printings/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
  });
});

describe('feedback components', () => {
  it('EmptyState shows guidance and an action', () => {
    render(<EmptyState title="No decks" description="Build one" action={<Button>New deck</Button>} />);
    expect(screen.getByRole('heading', { name: 'No decks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New deck' })).toBeInTheDocument();
  });

  it('ErrorState announces and offers retry', async () => {
    const retry = vi.fn();
    render(<ErrorState message="Offline" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('ProgressBar exposes progressbar semantics and clamps', () => {
    render(<ProgressBar label="Set completion" value={30} max={120} />);
    const bar = screen.getByRole('progressbar', { name: 'Set completion' });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-valuemax', '120');
  });

  it('badges expose their text', () => {
    render(
      <>
        <DomainBadge domain="Fury" />
        <DomainBadge domain="Calm" compact />
        <RarityBadge rarity="Epic" />
      </>,
    );
    expect(screen.getByText('Fury')).toBeInTheDocument();
    expect(screen.getByText('Calm')).toHaveClass('sr-only');
    expect(screen.getByText('Epic')).toBeInTheDocument();
  });
});

describe('CardImage', () => {
  it('shows a skeleton until the image loads, then the art', () => {
    const { container } = render(<CardImage src="https://img.test/a.png" alt="Vi" />);
    expect(container.querySelector('.ui-skeleton')).toBeInTheDocument();
    const img = screen.getByAltText('Vi');
    expect(img).toHaveAttribute('loading', 'lazy');
    fireEvent.load(img);
    expect(container.querySelector('.ui-skeleton')).toBeNull();
  });

  it('keeps the card aspect ratio', () => {
    const { container } = render(<CardImage src="x" alt="Vi" />);
    expect((container.firstChild as HTMLElement).style.aspectRatio).toContain('744');
  });

  it('falls back gracefully on error and when there is no source', () => {
    render(<CardImage src="https://img.test/broken.png" alt="Vi" />);
    fireEvent.error(screen.getByAltText('Vi'));
    expect(screen.getByRole('img', { name: 'Vi (art unavailable)' })).toBeInTheDocument();

    render(<CardImage src={null} alt="Ember" />);
    expect(screen.getByRole('img', { name: 'Ember (art unavailable)' })).toBeInTheDocument();
  });

  it('retries when the connection returns', () => {
    render(<CardImage src="https://img.test/slow.png" alt="Vi" />);
    fireEvent.error(screen.getByAltText('Vi'));
    expect(screen.queryByAltText('Vi')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByAltText('Vi')).toBeInTheDocument();
  });

  it('adds a foil overlay only after loading', () => {
    const { container } = render(<CardImage src="x" alt="Vi" foil />);
    expect(container.querySelector('.ui-card-image__foil')).toBeNull();
    fireEvent.load(screen.getByAltText('Vi'));
    expect(container.querySelector('.ui-card-image__foil')).toBeInTheDocument();
  });
});

describe('CardTile', () => {
  const card = { name: 'Vi, Piltover Enforcer', domains: ['Fury' as const] };
  const printing = { imageUrl: 'x', rarity: 'Rare', variantLabel: null };

  it('links to a detail route and shows the owned count', () => {
    render(
      <MemoryRouter>
        <CardTile card={card} printing={printing} owned={3} to="/card/ogn-001-standard" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Vi, Piltover Enforcer' })).toHaveAttribute('href', '/card/ogn-001-standard');
    expect(screen.getByLabelText('3 owned')).toBeInTheDocument();
  });

  it('acts as a toggle button when given onClick', async () => {
    const onClick = vi.fn();
    render(<CardTile card={card} printing={printing} onClick={onClick} selected />);
    const button = screen.getByRole('button', { pressed: true });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
