import { config } from "@config";
import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations();

	return (
		<footer className="py-6 text-sm text-foreground/45">
			<div className="gap-6 flex items-center justify-center">
				<a
					href={`${config.marketingUrl ?? ""}/legal/privacy-policy`}
					className="block transition-colors hover:text-foreground"
				>
					{t("common.footer.privacyPolicy")}
				</a>

				<a
					href={`${config.marketingUrl ?? ""}/legal/terms`}
					className="block transition-colors hover:text-foreground"
				>
					{t("common.footer.termsAndConditions")}
				</a>
			</div>
		</footer>
	);
}
