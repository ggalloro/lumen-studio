import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogTrigger,
  Divider,
  Flex,
  Form,
  Heading,
  Item,
  LabeledValue,
  ListView,
  Text,
  TextField,
  View,
} from '@adobe/react-spectrum';
import UploadToCloud from '@spectrum-icons/workflow/UploadToCloud';
import { useState } from 'react';
import { assetsApi, blobSrc, type Asset, type Version } from '../../api/assets';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FileField } from '../../components/FileField';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useDirectory } from '../../lib/users';

interface VersionsTabProps {
  asset: Asset;
  versions: Version[];
  selected: Version;
  onSelect: (version: number) => void;
  onUploaded: (version: Version) => void | Promise<void>;
}

export function VersionsTab({ asset, versions, selected, onSelect, onUploaded }: VersionsTabProps) {
  const { byId } = useDirectory();
  const newestFirst = [...versions].reverse();

  return (
    <Flex gap="size-300" wrap>
      <Flex direction="column" gap="size-150" width="size-3600">
        <DialogTrigger>
          <Button variant="secondary" data-testid="upload-version-open">
            <UploadToCloud />
            <Text>Upload new version</Text>
          </Button>
          {(close) => <NewVersionDialog asset={asset} close={close} onUploaded={onUploaded} />}
        </DialogTrigger>
        <ListView
          aria-label="Versions"
          items={newestFirst}
          selectionMode="single"
          selectionStyle="highlight"
          disallowEmptySelection
          selectedKeys={[String(selected.version)]}
          onSelectionChange={(keys) => {
            if (keys !== 'all' && keys.size > 0) onSelect(Number([...keys][0]));
          }}
          maxHeight="size-6000"
          data-testid="version-list"
        >
          {(v) => (
            <Item key={String(v.version)} textValue={`Version ${v.version}`}>
              <Text>Version {v.version}</Text>
              <Text slot="description">
                {formatDateTime(v.created_at)} · {byId.get(v.created_by)?.name ?? `User ${v.created_by}`}
              </Text>
            </Item>
          )}
        </ListView>
      </Flex>

      <Flex direction="column" gap="size-200" flex="1 1 400px" minWidth={0}>
        <View UNSAFE_className="preview-frame">
          <img
            className="preview-image"
            src={blobSrc(selected.blob_url)}
            alt={selected.alt_text || asset.title}
            data-testid="version-preview"
          />
        </View>
        <Flex gap="size-300" wrap>
          <LabeledValue label="File" value={selected.filename} />
          <LabeledValue label="Dimensions" value={`${selected.width} × ${selected.height}`} />
          <LabeledValue label="Size" value={formatBytes(selected.size_bytes)} />
          <LabeledValue label="Alt text" value={selected.alt_text || 'None'} />
        </Flex>
        <Text>
          <a href={blobSrc(selected.blob_url, true)} className="text-link" data-testid="download-original">
            Download original
          </a>
        </Text>
      </Flex>
    </Flex>
  );
}

function NewVersionDialog({
  asset,
  close,
  onUploaded,
}: {
  asset: Asset;
  close: () => void;
  onUploaded: (version: Version) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState(asset.latest_version?.alt_text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const version = await assetsApi.addVersion(asset.id, file, altText.trim());
      await onUploaded(version);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <Heading>New version of {asset.title}</Heading>
      <Divider />
      <Content>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FileField file={file} onChange={setFile} />
          <TextField label="Alt text" value={altText} onChange={setAltText} />
          <ErrorMessage error={error} title="Upload failed" />
        </Form>
      </Content>
      <ButtonGroup>
        <Button variant="secondary" onPress={close} isDisabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onPress={submit} isDisabled={!file || busy} data-testid="upload-version-submit">
          {busy ? 'Uploading' : 'Upload'}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
