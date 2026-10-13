import { Button, Flex, Heading, Meter, Text, View, Well } from '@adobe/react-spectrum';
import Refresh from '@spectrum-icons/workflow/Refresh';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { brandApi, RULE_LABELS, type Report } from '../../api/brand';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { BrandStatusChip } from '../../components/StatusChip';
import { Swatch } from '../../components/Swatch';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

interface BrandCheckTabProps {
  assetId: number;
  version: number;
}

export function BrandCheckTab({ assetId, version }: BrandCheckTabProps) {
  const report = useAsync<Report | null>(
    () =>
      brandApi.latest(assetId, version).catch((err) => {
        // 404 means no check has been run for this version yet.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    [assetId, version],
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      report.setData(await brandApi.runCheck(assetId, version));
    } catch (err) {
      setRunError(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Flex direction="column" gap="size-200">
      <Flex alignItems="center" gap="size-200" wrap>
        <Button variant="accent" onPress={run} isPending={running} data-testid="run-brand-check">
          <Refresh />
          <Text>Run brand check</Text>
        </Button>
        <Text UNSAFE_className="muted">Version {version}</Text>
      </Flex>
      <ErrorMessage error={runError} title="Brand check failed to run" />
      <ErrorMessage error={report.error} title="Could not load report" />

      {report.loading && report.data === undefined ? (
        <Loading />
      ) : report.data === null ? (
        <Text>No brand check has been run for this version.</Text>
      ) : report.data ? (
        <ReportView report={report.data} />
      ) : null}
    </Flex>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <Flex direction="column" gap="size-200" data-testid="brand-report">
      <Flex alignItems="center" gap="size-300" wrap>
        <BrandStatusChip status={report.overall} />
        <Meter
          label="Score"
          value={report.score}
          width="size-3000"
          variant={report.overall === 'pass' ? 'positive' : report.overall === 'warn' ? 'warning' : 'critical'}
        />
        <Text UNSAFE_className="muted">
          {formatDateTime(report.created_at)}
        </Text>
      </Flex>
      {report.rules.map((rule) => (
        <Well key={rule.rule} data-testid="brand-rule" data-rule={rule.rule}>
          <Flex direction="column" gap="size-100">
            <Flex alignItems="center" gap="size-200">
              <Heading level={3} margin={0}>
                {RULE_LABELS[rule.rule] ?? rule.rule}
              </Heading>
              <BrandStatusChip status={rule.status} />
            </Flex>
            <Text>{rule.message}</Text>
            {rule.details?.colors && rule.details.colors.length > 0 && (
              <View>
                <Text UNSAFE_className="muted">Dominant colours</Text>
                <Flex gap="size-200" wrap marginTop="size-100">
                  {rule.details.colors.map((c) => (
                    <Swatch
                      key={c.hex}
                      hex={c.hex}
                      label={`${Math.round(c.share * 100)}%${c.neutral ? ' neutral' : c.on_palette ? '' : ' off palette'}`}
                      detail={`ΔE ${c.delta_e.toFixed(1)} to ${c.nearest}`}
                    />
                  ))}
                </Flex>
              </View>
            )}
          </Flex>
        </Well>
      ))}
    </Flex>
  );
}
