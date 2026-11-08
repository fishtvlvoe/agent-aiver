import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { AiverLogo } from "@shared/components/AiverLogo";
import { useTranslations } from "next-intl";

export function Footer() {
	const t = useTranslations();

	return (
		<footer className="py-10 text-sm border-t border-border/60 text-foreground/45">
			<div className="container gap-4 sm:flex-row sm:items-center sm:justify-between flex flex-col">
				<AiverLogo className="opacity-70" />

				<p>
					© {new Date().getFullYear()} {config.appName}
				</p>

				<div className="gap-6 flex items-center">
					<LocaleLink
						href="/legal/privacy-policy"
						className="block transition-colors hover:text-touch"
					>
						{t("common.footer.privacyPolicy")}
					</LocaleLink>

					<LocaleLink href="/legal/terms" className="block transition-colors hover:text-touch">
						{t("common.footer.termsAndConditions")}
					</LocaleLink>
				</div>
			</div>
		</footer>
	);
}
