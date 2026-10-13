import { Flex, Text } from '@adobe/react-spectrum';

interface SwatchProps {
  hex: string;
  label?: string;
  detail?: string;
  size?: number;
}

export function Swatch({ hex, label, detail, size = 40 }: SwatchProps) {
  return (
    <Flex direction="column" gap="size-50" UNSAFE_className="swatch" data-testid="swatch">
      <span className="swatch-color" style={{ backgroundColor: hex, width: size, height: size }} title={hex} />
      {label && <Text UNSAFE_className="swatch-label">{label}</Text>}
      <Text UNSAFE_className="muted swatch-hex">{hex.toUpperCase()}</Text>
      {detail && <Text UNSAFE_className="muted swatch-hex">{detail}</Text>}
    </Flex>
  );
}
