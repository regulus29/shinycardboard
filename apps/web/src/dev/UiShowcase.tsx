import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  CardTile,
  Checkbox,
  Chip,
  Dialog,
  Drawer,
  DOMAIN_ORDER,
  DomainBadge,
  EmptyState,
  ErrorState,
  Icon,
  ICON_NAMES,
  IconButton,
  Menu,
  PageHeader,
  ProgressBar,
  RARITY_ORDER,
  RarityBadge,
  SearchField,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  Stepper,
  Switch,
  Tabs,
  TextField,
  Tooltip,
  useToast,
} from '../ui';
import { useRequiredCatalog } from '../data';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)', color: 'var(--text-muted)' }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>{children}</div>
    </section>
  );
}

/** Development-only gallery of the design system at /dev/ui. Not part of production builds. */
export default function UiShowcase() {
  const catalog = useRequiredCatalog();
  const toast = useToast();
  const [seg, setSeg] = useState('grid');
  const [tab, setTab] = useState('a');
  const [qty, setQty] = useState(2);
  const [on, setOn] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState('');
  const printings = Object.values(catalog.printings).filter((p) => p.imageUrl).slice(0, 6);

  return (
    <div className="page">
      <PageHeader title="UI showcase" subtitle="Every design system component, for visual QA" />

      <Block title="Buttons">
        <Button variant="primary" icon="plus">Add card</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger" icon="trash">Delete</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <Button size="lg" variant="primary">Large</Button>
        <IconButton icon="edit" label="Edit" />
        <IconButton icon="filter" label="Filter" active />
      </Block>

      <Block title="Fields">
        <div style={{ width: 240 }}><TextField label="Deck name" placeholder="Fury aggro" hint="Shown in lists" /></div>
        <div style={{ width: 240 }}><TextField label="Name" error="Required" defaultValue="" /></div>
        <div style={{ width: 280 }}><SearchField label="Search" value={search} onValueChange={setSearch} placeholder="Search" /></div>
        <div style={{ width: 200 }}>
          <Select label="Condition" value="NM" onValueChange={() => undefined} options={[{ value: 'NM', label: 'Near mint' }, { value: 'LP', label: 'Lightly played' }]} />
        </div>
      </Block>

      <Block title="Toggles">
        <Checkbox label="Foil only" checked={on} onCheckedChange={setOn} />
        <Checkbox label="Mixed" checked={false} indeterminate onCheckedChange={() => undefined} />
        <div style={{ width: 280 }}><Switch label="Auto sync" description="Every minute" checked={on} onCheckedChange={setOn} /></div>
        <SegmentedControl label="View" value={seg} onValueChange={setSeg} options={[{ value: 'grid', label: 'Grid', icon: 'grid' }, { value: 'list', label: 'List', icon: 'list' }]} />
        <Stepper label="Quantity" value={qty} onChange={setQty} />
      </Block>

      <Block title="Badges, chips, domains, rarity">
        <Badge>Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="success">Synced</Badge>
        <Badge tone="warning">Offline</Badge>
        <Badge tone="danger">Error</Badge>
        <Chip>Aggro</Chip>
        <Chip selected onClick={() => undefined}>Selected</Chip>
        <Chip onRemove={() => undefined}>Removable</Chip>
        {DOMAIN_ORDER.map((d) => <DomainBadge key={d} domain={d} />)}
        {RARITY_ORDER.map((r) => <RarityBadge key={r} rarity={r} />)}
      </Block>

      <Block title="Overlays">
        <Button onClick={() => setDialog(true)}>Dialog</Button>
        <Button onClick={() => setDrawer(true)}>Sheet</Button>
        <Menu label="Actions" trigger={({ props }) => <IconButton icon="more" label="More" {...props} />} items={[{ label: 'Edit', icon: 'edit', onSelect: () => undefined }, { label: 'Delete', icon: 'trash', danger: true, onSelect: () => undefined }]} />
        <Tooltip label="Tooltip text"><Button variant="ghost">Hover me</Button></Tooltip>
        <Button onClick={() => toast.show({ title: 'Collection saved', description: 'All changes stored on this device.', tone: 'success' })}>Toast</Button>
        <Button onClick={() => toast.show({ title: 'Sync failed', description: 'Could not reach the server', tone: 'danger' })}>Error toast</Button>
      </Block>

      <Block title="Tabs">
        <div style={{ width: '100%' }}>
          <Tabs label="Demo" value={tab} onValueChange={setTab} items={[{ value: 'a', label: 'Overview', content: <p>Overview panel</p> }, { value: 'b', label: 'Printings', count: 4, content: <p>Printings panel</p> }]} />
        </div>
      </Block>

      <Block title="Loading, progress">
        <Spinner /> <Skeleton width={160} height={16} shape="text" /> <Skeleton width={40} height={40} shape="circle" />
        <div style={{ width: 260 }}><ProgressBar label="Completion" value={72} max={120} showValue /></div>
      </Block>

      <Block title="Card tiles (hover for glow; second is foil; third is dimmed)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-4)', width: '100%' }}>
          {printings.map((p, i) => {
            const card = catalog.cards[p.cardKey];
            return card ? (
              <CardTile key={p.printingKey} card={card} printing={p} owned={i + 1} foil={i === 1} dimmed={i === 2} subtitle={`${p.setId} ${p.collectorNumber}`} onClick={() => undefined} footer={<Stepper label="Qty" size="sm" value={i} onChange={() => undefined} />} />
            ) : null;
          })}
          <div>
            <div style={{ aspectRatio: '744 / 1039' }}>
              <Skeleton width="100%" height="100%" />
            </div>
            <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>Skeleton tile</p>
          </div>
          <CardTile card={{ name: 'Art offline', domains: ['Mind'] }} printing={{ imageUrl: '', rarity: 'Epic', variantLabel: null }} />
        </div>
      </Block>

      <Block title="States">
        <div style={{ flex: 1, minWidth: 280 }}><EmptyState title="No decks yet" description="Create your first deck to see it here." action={<Button variant="primary" icon="plus">New deck</Button>} /></div>
        <div style={{ flex: 1, minWidth: 280 }}><ErrorState message="Could not load the catalog." onRetry={() => undefined} /></div>
      </Block>

      <Block title={`Icons (${ICON_NAMES.length})`}>
        {ICON_NAMES.map((name) => (
          <span key={name} title={name} style={{ display: 'grid', placeItems: 'center', gap: 4, width: 72, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            <Icon name={name} size={24} />
            {name}
          </span>
        ))}
      </Block>

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Delete this deck?" description="This cannot be undone." footer={<><Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button><Button variant="danger" onClick={() => setDialog(false)}>Delete</Button></>}>
        <p>Cards stay in your collection.</p>
      </Dialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters">
        <p>Sheet content goes here.</p>
      </Drawer>
    </div>
  );
}
