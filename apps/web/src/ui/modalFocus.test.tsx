import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, Drawer } from './index';

/**
 * jsdom does not implement `inert`, so emulate the browser rule that matters here: an element
 * inside an inert subtree cannot take focus, and making an element inert blurs it.
 */
function installInertEmulation() {
  const realFocus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function focus(this: HTMLElement, options?: FocusOptions) {
    if (this.closest('[inert]')) return;
    realFocus.call(this, options);
  });
  const root = document.getElementById('root')!;
  const observer = new MutationObserver(() => {
    if (root.hasAttribute('inert') && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['inert'] });
  return () => observer.disconnect();
}

function Harness({ kind = 'dialog' }: { kind?: 'dialog' | 'drawer' }) {
  const [open, setOpen] = useState(false);
  const Panel = kind === 'dialog' ? Dialog : Drawer;
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Panel open={open} onClose={() => setOpen(false)} title="Panel">
        <button>Inside</button>
      </Panel>
    </>
  );
}

let stop: () => void;
beforeEach(() => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  stop = installInertEmulation();
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  document.getElementById('root')?.remove();
});

const mount = (kind: 'dialog' | 'drawer') =>
  render(<Harness kind={kind} />, { container: document.getElementById('root')!.appendChild(document.createElement('div')) });

describe.each(['dialog', 'drawer'] as const)('%s focus restoration with an inert app root', (kind) => {
  it('returns focus to the opener after Escape', async () => {
    mount(kind);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.getElementById('root')).toHaveAttribute('inert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('falls back to the main landmark when the opener was removed', () => {
    const main = document.createElement('main');
    main.tabIndex = -1;
    document.body.append(main);
    function Vanishing() {
      const [open, setOpen] = useState(false);
      const Panel = kind === 'dialog' ? Dialog : Drawer;
      return (
        <>
          {open ? null : <button onClick={() => setOpen(true)}>Gone soon</button>}
          <Panel open={open} onClose={() => setOpen(false)} title="Panel">
            body
          </Panel>
        </>
      );
    }
    render(<Vanishing />, { container: document.getElementById('root')!.appendChild(document.createElement('div')) });
    const opener = screen.getByRole('button', { name: 'Gone soon' });
    opener.focus();
    fireEvent.click(opener); // the opener unmounts while the panel is open
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(main).toHaveFocus();
    main.remove();
  });
});
