"use client";

import { config } from "@config";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";

export function HeroSection() {
	const t = useTranslations();
	const saasUrl = config.saasUrl;

	return (
		<section className="pt-20 pb-16 md:pt-28 md:pb-20 lg:pt-32 container">
			<div className="max-w-3xl">
				<h1 className="font-medium text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1] text-pretty text-foreground">
					{t("home.hero.title")}
				</h1>

				<p className="mt-6 text-base sm:text-lg max-w-2xl leading-relaxed text-pretty text-foreground/55">
					{t("home.hero.subtitle")}
				</p>

				{saasUrl && (
					<div className="mt-8 gap-3 flex flex-wrap items-center">
						<Button
							size="lg"
							variant="primary"
							render={(props) => (
								<a {...props} href={`${saasUrl}/signup`}>
									{t("home.hero.signup")}
								</a>
							)}
						/>
						<Button
							size="lg"
							variant="outline"
							render={(props) => (
								<a {...props} href={`${saasUrl}/login`}>
									{t("home.hero.login")}
								</a>
							)}
						/>
					</div>
				)}
			</div>
		</section>
	);
}
