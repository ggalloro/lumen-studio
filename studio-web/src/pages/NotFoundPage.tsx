import { Content, Heading, IllustratedMessage } from '@adobe/react-spectrum';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <IllustratedMessage>
      <Heading>Page not found</Heading>
      <Content>
        <Link to="/library" className="text-link">
          Back to the library
        </Link>
      </Content>
    </IllustratedMessage>
  );
}
