import { Flex, ProgressCircle } from '@adobe/react-spectrum';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <Flex justifyContent="center" marginY="size-400">
      <ProgressCircle aria-label={label} isIndeterminate />
    </Flex>
  );
}
