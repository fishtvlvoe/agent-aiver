"use client";

import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { AiverLogo } from "@shared/components/AiverLogo";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";

export function NavBar() {
	const t = useTranslations();
	const saasUrl = config.saasUrl;

	return (
		<nav
			className="top-0 sticky z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl"
			data-test="navigation"
		>
			<div className="container">
				<div className="gap-6 h-16 md:h-[4.25rem] flex items-center justify-between">
					<LocaleLink href="/" className="block hover:no-underline active:no-underline">
						<AiverLogo />
					</LocaleLink>

					{saasUrl && (
						<Button
							variant="outline"
							render={(props) => (
								<a {...props} href={`${saasUrl}/login`}>
									{t("common.menu.login")}
								</a>
							)}
						/>
					)}
				</div>
			</div>
		</nav>
	);
}
