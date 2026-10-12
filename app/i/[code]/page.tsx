import type { Metadata } from 'next';
import { cloudClient } from '../../api/_client.js';
import { getInvite } from '../../../lib/cloud-db.mjs';
import InviteClient from './invite-client';

type Props = { params: Promise<{ code: string }> };

// The link preview in LINE / 微信 is the first thing a friend sees, so it
// names the event. Any failure falls back to the generic site metadata.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const base: Metadata = { robots: { index: false, follow: false } };
  try {
    const client = cloudClient();
    try {
      const invite = await getInvite(client, code);
      if (!invite) return base;
      const title = `想一起去吗？${invite.snapshot.titleZh ?? invite.snapshot.title}`;
      const description = '朋友想去这个，你呢？想去 / 可以 / 不想去，投完揭晓。';
      return { ...base, title, description, openGraph: { title, description, type: 'website' } };
    } finally {
      client.close();
    }
  } catch {
    return base;
  }
}

export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  return <InviteClient code={code} />;
}
