import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import { useEffect, useRef, useState } from 'react';
import { blobSrc, findRendition, type Version } from '../../api/assets';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { usePresets } from '../../lib/presets';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // about one minute

interface RenditionsTabProps {
  version: Version;
  onRefresh: () => Promise<void>;
}

export function RenditionsTab({ version, onRefresh }: RenditionsTabProps) {
  const presets = usePresets();
  const missing = (presets.data ?? []).filter((p) => !findRendition(version, p.id));
  const pending = presets.data !== undefined && missing.length > 0;

  // Renditions are produced asynchronously after upload. Poll while some are
  // missing, but give up after a minute so a failed job does not poll forever.
  const polls = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);
  const [tick, setTick] = useState(0);
  const versionKey = `${version.asset_id}:${version.version}`;

  useEffect(() => {
    polls.current = 0;
    setGaveUp(false);
  }, [versionKey]);

  useEffect(() => {
    if (!pending || gaveUp) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      if (polls.current >= MAX_POLLS) setGaveUp(true);
      // Bump the tick even when the refresh fails so the next poll is scheduled.
      void onRefresh().finally(() => setTick((t) => t + 1));
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [pending, gaveUp, tick, onRefresh]);

  if (presets.error) return <ErrorMessage error={presets.error} title="Could not load presets" />;
  if (!presets.data) return <Loading />;

  return (
    <Flex direction="column" gap="size-200">
      {pending && gaveUp && (
        <Text UNSAFE_className="muted">Some renditions are still missing. Reload the page to check again.</Text>
      )}
      <div className="rendition-grid">
        {presets.data.map((preset) => {
          const r = findRendition(version, preset.id);
          return (
            <div
              key={preset.id}
              className="rendition-card"
              data-testid="rendition-card"
              data-preset={preset.id}
              data-ready={r ? 'true' : 'false'}
            >
              <div className="rendition-thumb" style={{ aspectRatio: `${preset.width} / ${preset.height}` }}>
                {r ? (
                  <img src={blobSrc(r.blob_url)} alt={`${preset.label} rendition`} loading="lazy" />
                ) : (
                  <Flex direction="column" alignItems="center" justifyContent="center" height="100%" gap="size-100">
                    {!gaveUp && <ProgressCircle size="S" aria-label="Processing" isIndeterminate />}
                    <Text>Processing</Text>
                  </Flex>
                )}
              </div>
              <Flex direction="column" gap="size-25" UNSAFE_className="rendition-meta">
                <Text UNSAFE_className="asset-card-title">{preset.label}</Text>
                <Text UNSAFE_className="muted">
                  {r ? `${r.width} × ${r.height}` : `${preset.width} × ${preset.height}`}
                </Text>
                {r && (
                  <a href={blobSrc(r.blob_url, true)} className="text-link" data-testid="rendition-download">
                    Download
                  </a>
                )}
              </Flex>
            </div>
          );
        })}
      </div>
    </Flex>
  );
}
