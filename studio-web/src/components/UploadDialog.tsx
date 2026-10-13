import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  Divider,
  Form,
  Heading,
  TextArea,
  TextField,
} from '@adobe/react-spectrum';
import { useState } from 'react';
import { assetsApi, type Asset } from '../api/assets';
import { ErrorMessage } from './ErrorMessage';
import { FileField } from './FileField';

interface UploadDialogProps {
  close: () => void;
  onUploaded: (asset: Asset) => void;
}

export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

export function UploadDialog({ close, onUploaded }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [altText, setAltText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = !!file && title.trim() !== '' && !busy;

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await assetsApi.create({
        file,
        title: title.trim(),
        description: description.trim(),
        tags: parseTags(tags),
        alt_text: altText.trim(),
      });
      onUploaded(asset);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog data-testid="upload-dialog">
      <Heading>Upload asset</Heading>
      <Divider />
      <Content>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          <FileField file={file} onChange={setFile} />
          <TextField label="Title" value={title} onChange={setTitle} isRequired autoFocus />
          <TextArea label="Description" value={description} onChange={setDescription} />
          <TextField
            label="Tags"
            description="Comma separated, for example: jacket, fall"
            value={tags}
            onChange={setTags}
          />
          <TextField label="Alt text" value={altText} onChange={setAltText} />
          <ErrorMessage error={error} title="Upload failed" />
        </Form>
      </Content>
      <ButtonGroup>
        <Button variant="secondary" onPress={close} isDisabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onPress={submit} isDisabled={!canSubmit} data-testid="upload-submit">
          {busy ? 'Uploading' : 'Upload'}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
