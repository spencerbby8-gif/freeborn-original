import type { Metadata } from 'next';
import { ogCard } from '@/lib/site';
import { GuidePage, GuideBody } from '@/components/guides/guide-page';
import { datingGuide, GUIDE_REVIEW_DATE } from '@/lib/dating-guides';
const guide = datingGuide('scam-spotting');
const path = '/guides/'+guide.slug;
export const metadata: Metadata = {title:{absolute:guide.title+' | Freeborn'},description:guide.description,alternates:{canonical:path},openGraph:ogCard(path,guide.title,guide.description)};
export default function Page(){return <GuidePage path={path} title={guide.title} description={guide.description} eyebrow={guide.category} updated={GUIDE_REVIEW_DATE} intro={guide.intro} faqs={guide.faqs} toc={guide.sections}><GuideBody guide={guide}/></GuidePage>;}
