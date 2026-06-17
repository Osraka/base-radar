alter table public.apps
  drop constraint if exists apps_category_check;

alter table public.apps
  add constraint apps_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure',
      'Bridge'
    )
  );

alter table public.submissions
  drop constraint if exists submissions_category_check;

alter table public.submissions
  add constraint submissions_category_check check (
    category in (
      'DeFi',
      'Social',
      'NFT',
      'Gaming',
      'AI Agent',
      'Wallet',
      'Mini App',
      'Infrastructure',
      'Bridge'
    )
  );
