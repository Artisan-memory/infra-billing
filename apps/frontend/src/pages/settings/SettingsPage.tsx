import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { GeneralSettingsCard } from './GeneralSettingsCard';
import { RatesCard } from './RatesCard';
import { RemnawaveMigrationButton } from './RemnawaveMigrationModal';
import { TelegramSettingsCard } from './TelegramSettingsCard';

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={<RemnawaveMigrationButton />}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <GeneralSettingsCard />
        <TelegramSettingsCard />
      </div>

      <RatesCard />
    </div>
  );
}
