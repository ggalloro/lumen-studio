import {
  Button,
  ButtonGroup,
  Content,
  DatePicker,
  Dialog,
  DialogTrigger,
  Divider,
  Flex,
  Form,
  Heading,
  ProgressBar,
  StatusLight,
  Text,
  TextArea,
  TextField,
  View,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import { today, getLocalTimeZone, type CalendarDate } from '@internationalized/date';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { campaignsApi, type Campaign } from '../api/campaigns';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { formatDate } from '../lib/format';
import { campaignStatusAppearance } from '../lib/status';
import { useAsync } from '../lib/useAsync';

export function CampaignsPage() {
  const navigate = useNavigate();
  const campaigns = useAsync(() => campaignsApi.list().then((r) => r.items), []);

  return (
    <Flex direction="column" gap="size-300">
      <Flex alignItems="center" justifyContent="space-between" wrap gap="size-200">
        <Heading level={1} margin={0}>
          Campaigns
        </Heading>
        <DialogTrigger>
          <Button variant="accent" data-testid="new-campaign-open">
            <Add />
            <Text>New campaign</Text>
          </Button>
          {(close) => <NewCampaignDialog close={close} onCreated={(c) => navigate(`/campaigns/${c.id}`)} />}
        </DialogTrigger>
      </Flex>
      <ErrorMessage error={campaigns.error} title="Could not load campaigns" />
      {campaigns.loading && !campaigns.data ? (
        <Loading />
      ) : (campaigns.data ?? []).length === 0 ? (
        <Text>No campaigns yet.</Text>
      ) : (
        <Flex direction="column" gap="size-150">
          {campaigns.data?.map((c) => <CampaignRow key={c.id} campaign={c} />)}
        </Flex>
      )}
    </Flex>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const readiness = useAsync(() => campaignsApi.readiness(campaign.id), [campaign.id]);
  const status = campaignStatusAppearance(campaign.status);
  const r = readiness.data;

  return (
    <View
      backgroundColor="gray-75"
      borderWidth="thin"
      borderColor="gray-300"
      borderRadius="medium"
      padding="size-200"
      data-testid="campaign-row"
    >
      <Flex alignItems="center" gap="size-300" wrap>
        <Flex direction="column" gap="size-50" flex="1 1 240px">
          <Link to={`/campaigns/${campaign.id}`} className="text-link campaign-name" data-testid="campaign-link">
            {campaign.name}
          </Link>
          <Text UNSAFE_className="muted">Due {formatDate(campaign.due_date)}</Text>
        </Flex>
        <StatusLight variant={status.variant}>{status.label}</StatusLight>
        <View width="size-3000">
          {r ? (
            <ProgressBar
              label="Ready"
              value={r.ready_count}
              minValue={0}
              maxValue={Math.max(r.total, 1)}
              valueLabel={`${r.ready_count} of ${r.total}`}
              width="100%"
            />
          ) : readiness.error ? (
            <Text UNSAFE_className="muted">Readiness unavailable</Text>
          ) : (
            <ProgressBar label="Ready" isIndeterminate width="100%" />
          )}
        </View>
      </Flex>
    </View>
  );
}

function NewCampaignDialog({ close, onCreated }: { close: () => void; onCreated: (c: Campaign) => void }) {
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [due, setDue] = useState<CalendarDate | null>(today(getLocalTimeZone()).add({ weeks: 4 }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = name.trim() !== '' && due !== null && !busy;

  const submit = async () => {
    if (!due) return;
    setBusy(true);
    setError(null);
    try {
      const campaign = await campaignsApi.create({ name: name.trim(), brief: brief.trim(), due_date: due.toString() });
      onCreated(campaign);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <Heading>New campaign</Heading>
      <Divider />
      <Content>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          <TextField label="Name" value={name} onChange={setName} isRequired autoFocus />
          <TextArea label="Brief" value={brief} onChange={setBrief} />
          <DatePicker label="Due date" value={due} onChange={setDue} isRequired />
          <ErrorMessage error={error} title="Could not create campaign" />
        </Form>
      </Content>
      <ButtonGroup>
        <Button variant="secondary" onPress={close} isDisabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onPress={submit} isDisabled={!canSubmit} data-testid="new-campaign-submit">
          Create
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
