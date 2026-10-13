import { Button, FileTrigger, Flex, Text } from '@adobe/react-spectrum';
import UploadToCloud from '@spectrum-icons/workflow/UploadToCloud';

interface FileFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  label?: string;
}

/** Image file chooser limited to the formats the assets service accepts. */
export function FileField({ file, onChange, label = 'Choose image' }: FileFieldProps) {
  return (
    <Flex direction="column" gap="size-50">
      <Text UNSAFE_className="field-label">Image file (PNG or JPEG, up to 25 MB)</Text>
      <Flex alignItems="center" gap="size-150">
        <FileTrigger
          acceptedFileTypes={['image/png', 'image/jpeg']}
          onSelect={(files) => onChange(files?.[0] ?? null)}
        >
          <Button variant="secondary" data-testid="file-choose">
            <UploadToCloud />
            <Text>{label}</Text>
          </Button>
        </FileTrigger>
        <Text data-testid="file-name">{file ? file.name : 'No file selected'}</Text>
      </Flex>
    </Flex>
  );
}
