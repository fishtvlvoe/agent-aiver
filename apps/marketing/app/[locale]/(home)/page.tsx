import { FeaturesSection } from "@home/components/FeaturesSection";
import { HeroSection } from "@home/components/HeroSection";
import { StepsSection } from "@home/components/StepsSection";
import { setRequestLocale } from "next-intl/server";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	setRequestLocale(locale);

	return (
		<>
			<HeroSection />
			<StepsSection />
			<FeaturesSection />
		</>
	);
}
