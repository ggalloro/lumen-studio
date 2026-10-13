import { Content, Heading, InlineAlert } from '@adobe/react-spectrum';
import { errorMessage } from '../api/client';

export function ErrorMessage({ error, title = 'Something went wrong' }: { error: unknown; title?: string }) {
  if (!error) return null;
  return (
    <InlineAlert variant="negative" width="100%">
      <Heading>{title}</Heading>
      <Content>{errorMessage(error)}</Content>
    </InlineAlert>
  );
}
