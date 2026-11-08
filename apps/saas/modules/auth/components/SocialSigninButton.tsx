"use client";

import { config } from "@config";
import { authClient } from "@repo/auth/client";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/toast";
import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";

import { oAuthProviders } from "../constants/oauth-providers";
import { LastUsedBadge } from "./LastUsedBadge";

export function SocialSigninButton({
	provider,
	className,
	label,
}: {
	provider: keyof typeof oAuthProviders;
	className?: string;
	label?: string;
}) {
	const t = useTranslations();
	const [invitationId] = useQueryState("invitationId", parseAsString);
	const providerData = oAuthProviders[provider];

	const redirectPath = invitationId
		? `/organization-invitation/${invitationId}`
		: config.redirectAfterSignIn;

	const onSignin = async () => {
		const callbackURL = new URL(redirectPath, window.location.origin);
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL: callbackURL.toString(),
		});

		if (error) {
			toast.add({ title: t("auth.login.hints.socialSigninFailed"), type: "error" });
		}
	};

	return (
		<Button
			onClick={() => onSignin()}
			variant="secondary"
			type="button"
			className={cn("relative overflow-visible", className)}
		>
			{providerData.icon && (
				<i className="mr-2 text-primary">
					<providerData.icon className="size-4" />
				</i>
			)}
			{label ?? providerData.name}
			<LastUsedBadge method={provider} placement="corner" />
		</Button>
	);
}
