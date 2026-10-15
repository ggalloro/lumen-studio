import {
  ActionButton,
  Button,
  Flex,
  Form,
  Heading,
  LabeledValue,
  NumberField,
  Text,
  TextArea,
  TextField,
  View,
  Well,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import Delete from '@spectrum-icons/workflow/Delete';
import { useState } from 'react';
import { brandApi, type BrandKit, type BrandKitInput, type PaletteColor } from '../api/brand';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { Swatch } from '../components/Swatch';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function BrandKitPage() {
  const { user } = useAuth();
  const kit = useAsync(() => brandApi.getKit(), []);
  const [editing, setEditing] = useState(false);
  const canEdit = user?.role === 'brand_admin';

  if (kit.error && !kit.data) return <ErrorMessage error={kit.error} title="Could not load brand kit" />;
  if (!kit.data) return <Loading />;

  return (
    <Flex direction="column" gap="size-300">
      <Flex alignItems="center" justifyContent="space-between" wrap gap="size-200">
        <View>
          <Heading level={1} margin={0}>
            Brand Kit
          </Heading>
          <Text UNSAFE_className="muted">
            {kit.data.name}
            {kit.data.updated_at ? ` · updated ${formatDateTime(kit.data.updated_at)}` : ''}
          </Text>
        </View>
        {canEdit && !editing && (
          <Button variant="accent" onPress={() => setEditing(true)} data-testid="brand-edit">
            Edit
          </Button>
        )}
      </Flex>
      {editing ? (
        <BrandKitForm
          kit={kit.data}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            kit.setData(saved);
            setEditing(false);
          }}
        />
      ) : (
        <BrandKitView kit={kit.data} />
      )}
    </Flex>
  );
}

function BrandKitView({ kit }: { kit: BrandKit }) {
  return (
    <Flex direction="column" gap="size-300">
      <View>
        <Heading level={2} marginTop={0}>
          Palette
        </Heading>
        {kit.palette.length === 0 ? (
          <Text UNSAFE_className="muted">No colours defined.</Text>
        ) : (
          <Flex gap="size-300" wrap data-testid="brand-palette">
            {kit.palette.map((c) => (
              <Swatch key={`${c.name}-${c.hex}`} hex={c.hex} label={c.name} size={64} />
            ))}
          </Flex>
        )}
        <View marginTop="size-200">
          <LabeledValue label="Palette tolerance (ΔE)" value={kit.palette_tolerance} />
        </View>
      </View>
      <View>
        <Heading level={2} marginTop={0}>
          Fonts
        </Heading>
        {kit.fonts.length === 0 ? (
          <Text UNSAFE_className="muted">No fonts defined.</Text>
        ) : (
          <ul className="plain-list">
            {kit.fonts.map((f) => (
              <li key={f} style={{ fontFamily: `'${f}', sans-serif` }}>
                {f}
              </li>
            ))}
          </ul>
        )}
      </View>
      <Well>
        <Heading level={3} marginTop={0}>
          Tone of voice
        </Heading>
        <p className="prewrap">{kit.tone_of_voice || 'Not defined.'}</p>
      </Well>
      <Well>
        <Heading level={3} marginTop={0}>
          Logo rules
        </Heading>
        <p className="prewrap">{kit.logo_rules || 'Not defined.'}</p>
      </Well>
    </Flex>
  );
}

function BrandKitForm({
  kit,
  onCancel,
  onSaved,
}: {
  kit: BrandKit;
  onCancel: () => void;
  onSaved: (kit: BrandKit) => void;
}) {
  const [name, setName] = useState(kit.name);
  const [palette, setPalette] = useState<PaletteColor[]>(kit.palette);
  const [fonts, setFonts] = useState(kit.fonts.join(', '));
  const [tone, setTone] = useState(kit.tone_of_voice);
  const [logoRules, setLogoRules] = useState(kit.logo_rules);
  const [tolerance, setTolerance] = useState(kit.palette_tolerance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const invalidHex = palette.some((c) => !HEX.test(c.hex));

  const updateColor = (i: number, patch: Partial<PaletteColor>) =>
    setPalette((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    const input: BrandKitInput = {
      name: name.trim(),
      palette: palette.map((c) => ({ name: c.name.trim(), hex: c.hex.trim().toUpperCase() })),
      fonts: fonts
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      tone_of_voice: tone,
      logo_rules: logoRules,
      palette_tolerance: Number.isFinite(tolerance) ? tolerance : kit.palette_tolerance,
    };
    setBusy(true);
    setError(null);
    try {
      onSaved(await brandApi.updateKit(input));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      maxWidth="size-6000"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalidHex) void save();
      }}
      data-testid="brand-form"
    >
      <TextField label="Name" value={name} onChange={setName} isRequired data-testid="brand-name" />
      <View>
        <Text UNSAFE_className="field-label">Palette</Text>
        <Flex direction="column" gap="size-100" marginTop="size-50">
          {palette.map((c, i) => (
            <Flex key={i} gap="size-100" alignItems="end">
              <span
                className="swatch-color"
                style={{ backgroundColor: HEX.test(c.hex) ? c.hex : 'transparent', width: 32, height: 32 }}
              />
              <TextField
                aria-label={`Colour ${i + 1} name`}
                value={c.name}
                onChange={(v) => updateColor(i, { name: v })}
                placeholder="Name"
                data-testid={`brand-colour-${i + 1}-name`}
              />
              <TextField
                aria-label={`Colour ${i + 1} hex`}
                value={c.hex}
                onChange={(v) => updateColor(i, { hex: v })}
                validationState={HEX.test(c.hex) ? undefined : 'invalid'}
                width="size-1600"
                data-testid={`brand-colour-${i + 1}-hex`}
              />
              <ActionButton
                isQuiet
                aria-label={`Remove colour ${i + 1}`}
                onPress={() => setPalette((p) => p.filter((_, j) => j !== i))}
                data-testid={`brand-remove-colour-${i + 1}`}
              >
                <Delete />
              </ActionButton>
            </Flex>
          ))}
          <View>
            <ActionButton
              onPress={() => setPalette((p) => [...p, { name: '', hex: '#000000' }])}
              data-testid="brand-add-colour"
            >
              <Add />
              <Text>Add colour</Text>
            </ActionButton>
          </View>
        </Flex>
      </View>
      <NumberField
        label="Palette tolerance (ΔE)"
        value={tolerance}
        onChange={setTolerance}
        minValue={0}
        maxValue={100}
        data-testid="brand-palette-tolerance"
      />
      <TextField
        label="Fonts"
        description="Comma separated"
        value={fonts}
        onChange={setFonts}
        data-testid="brand-fonts"
      />
      <TextArea label="Tone of voice" value={tone} onChange={setTone} data-testid="brand-tone" />
      <TextArea label="Logo rules" value={logoRules} onChange={setLogoRules} data-testid="brand-logo-rules" />
      <ErrorMessage error={error} title="Brand kit not saved" />
      <Flex gap="size-100">
        <Button variant="secondary" onPress={onCancel} isDisabled={busy} data-testid="brand-cancel">
          Cancel
        </Button>
        <Button variant="accent" type="submit" isPending={busy} isDisabled={invalidHex} data-testid="brand-save">
          Save
        </Button>
      </Flex>
    </Form>
  );
}
