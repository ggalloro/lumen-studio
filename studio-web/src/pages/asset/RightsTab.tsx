import {
  Button,
  ButtonGroup,
  Checkbox,
  CheckboxGroup,
  Content,
  DatePicker,
  Dialog,
  DialogTrigger,
  Divider,
  Flex,
  Form,
  Heading,
  Item,
  LabeledValue,
  Picker,
  StatusLight,
  Text,
  TextArea,
  TextField,
  View,
  Well,
} from '@adobe/react-spectrum';
import Edit from '@spectrum-icons/workflow/Edit';
import { getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import type { Preset } from '../../api/renditions';
import {
  ALL_CHANNELS,
  LICENSE_TYPE_LABELS,
  rightsApi,
  type Clearance,
  type LicenseType,
  type Rights,
} from '../../api/rights';
import { useAuth } from '../../auth/AuthContext';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { formatDate, formatDateTime } from '../../lib/format';
import { loadPresets, usePresets } from '../../lib/presets';
import { useAsync } from '../../lib/useAsync';
import { useUserName } from '../../lib/users';

interface ChannelClearance {
  preset: Preset;
  clearance: Clearance;
}

function presetLabel(presets: Preset[], id: string): string {
  return presets.find((p) => p.id === id)?.label ?? id;
}

export function RightsTab({ assetId }: { assetId: number }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'designer' || user?.role === 'brand_admin';

  const rights = useAsync<Rights | null>(
    () =>
      rightsApi.get(assetId).catch((err) => {
        // 404 means no rights have been recorded for this asset.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    [assetId],
  );
  // Clearance for today on every channel preset.
  const clearances = useAsync<ChannelClearance[]>(
    () =>
      loadPresets().then((presets) =>
        Promise.all(
          presets.map(async (preset) => ({ preset, clearance: await rightsApi.clearance(assetId, preset.id) })),
        ),
      ),
    [assetId],
  );
  const presets = usePresets().data ?? [];

  const onSaved = async (saved: Rights) => {
    rights.setData(saved);
    await clearances.reload();
  };

  return (
    <Flex direction="column" gap="size-300" data-testid="rights-tab-content">
      <Flex alignItems="center" justifyContent="space-between" gap="size-200" wrap>
        <Heading level={2} margin={0}>
          Usage rights
        </Heading>
        {canEdit && rights.data !== undefined && (
          <DialogTrigger>
            <Button variant="accent" data-testid="rights-edit">
              <Edit />
              <Text>Edit rights</Text>
            </Button>
            {(close) => (
              <RightsDialog
                assetId={assetId}
                rights={rights.data ?? null}
                presets={presets}
                close={close}
                onSaved={onSaved}
              />
            )}
          </DialogTrigger>
        )}
      </Flex>

      <ErrorMessage error={rights.error} title="Could not load usage rights" />
      {rights.loading && rights.data === undefined ? (
        <Loading />
      ) : rights.data === null ? (
        <Text data-testid="rights-none">No usage rights on file</Text>
      ) : rights.data ? (
        <RightsView rights={rights.data} presets={presets} />
      ) : null}

      <View>
        <Heading level={3} marginTop={0}>
          Clearance today
        </Heading>
        <ErrorMessage error={clearances.error} title="Could not load clearance" />
        {clearances.loading && clearances.data === undefined ? (
          <Loading />
        ) : (
          <Flex direction="column" gap="size-100">
            {(clearances.data ?? []).map(({ preset, clearance }) => (
              <Flex
                key={preset.id}
                direction="column"
                data-testid="clearance-row"
                data-channel={preset.id}
                data-cleared={clearance.cleared ? 'true' : 'false'}
              >
                <StatusLight variant={clearance.cleared ? 'positive' : 'negative'}>
                  {preset.label}: {clearance.cleared ? 'Cleared' : 'Not cleared'}
                </StatusLight>
                {clearance.reasons.length > 0 && (
                  <ul className="blocker-list clearance-reasons">
                    {clearance.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </Flex>
            ))}
          </Flex>
        )}
      </View>
    </Flex>
  );
}

function RightsView({ rights, presets }: { rights: Rights; presets: Preset[] }) {
  const updatedBy = useUserName(rights.updated_by);
  const release = rights.model_release_required
    ? rights.model_release_on_file
      ? 'Required, on file'
      : 'Required, not on file'
    : 'Not required';

  return (
    <Well data-testid="rights-record">
      <Flex direction="column" gap="size-200">
        <Flex gap="size-300" wrap>
          <LabeledValue label="License type" value={LICENSE_TYPE_LABELS[rights.license_type] ?? rights.license_type} />
          <LabeledValue label="Licensor" value={rights.licensor || 'None'} />
          <LabeledValue label="Valid from" value={formatDate(rights.valid_from)} />
          <LabeledValue label="Expires on" value={rights.expires_on ? formatDate(rights.expires_on) : 'Perpetual'} />
          <LabeledValue label="Model release" value={release} />
        </Flex>
        <View>
          <Text UNSAFE_className="field-label">Channels</Text>
          <div className="tag-list" data-testid="rights-channels">
            {rights.channels.map((ch) => (
              <span key={ch} className="tag">
                {ch === ALL_CHANNELS ? 'All channels' : presetLabel(presets, ch)}
              </span>
            ))}
          </div>
        </View>
        {rights.notes && (
          <View>
            <Text UNSAFE_className="field-label">Notes</Text>
            <p className="prewrap">{rights.notes}</p>
          </View>
        )}
        <Text UNSAFE_className="muted">
          Last updated {formatDateTime(rights.updated_at)} by {updatedBy}
        </Text>
      </Flex>
    </Well>
  );
}

interface RightsDialogProps {
  assetId: number;
  rights: Rights | null;
  presets: Preset[];
  close: () => void;
  onSaved: (saved: Rights) => Promise<void>;
}

function RightsDialog({ assetId, rights, presets, close, onSaved }: RightsDialogProps) {
  const [licenseType, setLicenseType] = useState<LicenseType>(rights?.license_type ?? 'owned');
  const [licensor, setLicensor] = useState(rights?.licensor ?? '');
  const [channels, setChannels] = useState<string[]>(rights?.channels ?? [ALL_CHANNELS]);
  const [validFrom, setValidFrom] = useState<CalendarDate | null>(
    rights ? parseDate(rights.valid_from) : today(getLocalTimeZone()),
  );
  const [expiresOn, setExpiresOn] = useState<CalendarDate | null>(
    rights?.expires_on ? parseDate(rights.expires_on) : null,
  );
  const [releaseRequired, setReleaseRequired] = useState(rights?.model_release_required ?? false);
  const [releaseOnFile, setReleaseOnFile] = useState(rights?.model_release_on_file ?? false);
  const [notes, setNotes] = useState(rights?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = channels.length > 0 && validFrom !== null && !busy;

  // "All channels" and individual presets are mutually exclusive: picking one clears the other.
  const changeChannels = (next: string[]) => {
    const addedAll = next.includes(ALL_CHANNELS) && !channels.includes(ALL_CHANNELS);
    setChannels(addedAll ? [ALL_CHANNELS] : next.filter((c) => c !== ALL_CHANNELS));
  };

  const submit = async () => {
    if (!validFrom) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await rightsApi.update(assetId, {
        license_type: licenseType,
        licensor: licensor.trim(),
        channels,
        valid_from: validFrom.toString(),
        expires_on: expiresOn ? expiresOn.toString() : null,
        model_release_required: releaseRequired,
        model_release_on_file: releaseRequired && releaseOnFile,
        notes: notes.trim(),
      });
      await onSaved(saved);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog data-testid="rights-dialog">
      <Heading>Edit rights</Heading>
      <Divider />
      <Content>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          <Picker
            label="License type"
            selectedKey={licenseType}
            onSelectionChange={(k) => setLicenseType(k as LicenseType)}
          >
            {(Object.keys(LICENSE_TYPE_LABELS) as LicenseType[]).map((t) => (
              <Item key={t}>{LICENSE_TYPE_LABELS[t]}</Item>
            ))}
          </Picker>
          <TextField label="Licensor" value={licensor} onChange={setLicensor} />
          <CheckboxGroup
            label="Channels"
            value={channels}
            onChange={changeChannels}
            isRequired
            validationState={channels.length === 0 ? 'invalid' : undefined}
            errorMessage="Select at least one channel"
          >
            {[
              <Checkbox key={ALL_CHANNELS} value={ALL_CHANNELS}>
                All channels
              </Checkbox>,
              ...presets.map((p) => (
                <Checkbox key={p.id} value={p.id}>
                  {p.label}
                </Checkbox>
              )),
            ]}
          </CheckboxGroup>
          <DatePicker label="Valid from" value={validFrom} onChange={setValidFrom} isRequired />
          <DatePicker
            label="Expires on"
            description="Leave empty for perpetual rights"
            value={expiresOn}
            onChange={setExpiresOn}
          />
          <Checkbox
            isSelected={releaseRequired}
            onChange={(v) => {
              setReleaseRequired(v);
              if (!v) setReleaseOnFile(false);
            }}
          >
            Model release required
          </Checkbox>
          <Checkbox isSelected={releaseOnFile} onChange={setReleaseOnFile} isDisabled={!releaseRequired}>
            Model release on file
          </Checkbox>
          <TextArea label="Notes" value={notes} onChange={setNotes} />
          <ErrorMessage error={error} title="Could not save rights" />
        </Form>
      </Content>
      <ButtonGroup>
        <Button variant="secondary" onPress={close} isDisabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onPress={submit} isDisabled={!canSubmit} isPending={busy} data-testid="rights-save">
          Save
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
