import { IconBrandGithub, IconStarFilled } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Odometer } from '@/components/remocn/odometer';
import { Button } from '@/components/ui/button';

const REPO = 'Artisan-memory/infra-billing';
const REPO_URL = `https://github.com/${REPO}`;

export function GithubStars() {
  const { t } = useTranslation();
  const { data: stars } = useQuery({
    queryKey: ['github-stars'],
    queryFn: async () =>
      (await axios.get<{ stargazers_count: number }>(`https://api.github.com/repos/${REPO}`)).data
        .stargazers_count,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  if (stars == null) return null;

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="rounded-full hover:-translate-y-px hover:border-brand hover:shadow-[0_2px_12px_-6px_var(--brand)]"
      aria-label={t('app.starOnGithub')}
    >
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
        <IconBrandGithub className="size-4" />
        <span className="flex items-center gap-1.5">
          <IconStarFilled className="size-[13px] text-amber-400" />
          {/* Counter in the remocn github-stars style: an odometer with rolling digits. */}
          <Odometer value={stars} className="text-sm leading-none font-semibold" />
        </span>
      </a>
    </Button>
  );
}
