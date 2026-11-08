"use client";

import { LinkIcon, MessageCircleIcon, PencilLineIcon } from "lucide-react";
import { useTranslations } from "next-intl";

const steps = [
	{ id: "step1", icon: LinkIcon },
	{ id: "step2", icon: PencilLineIcon },
	{ id: "step3", icon: MessageCircleIcon },
];

export function StepsSection() {
	const t = useTranslations();

	return (
		<section className="py-16 lg:py-20 container border-t border-border/60">
			<h2 className="font-medium text-2xl sm:text-3xl tracking-tight text-foreground">
				{t("home.steps.title")}
			</h2>

			<ol className="mt-10 gap-6 md:grid-cols-3 grid grid-cols-1">
				{steps.map((step, index) => (
					<li key={step.id} className="p-6 rounded-2xl border border-border/60 bg-card">
						<div className="mb-5 gap-3 flex items-center">
							<span className="size-9 rounded-full bg-touch/15 text-touch flex items-center justify-center">
								<step.icon className="size-4" aria-hidden />
							</span>
							<span className="font-medium text-sm text-foreground/45">{index + 1}</span>
						</div>

						<h3 className="font-medium text-lg text-foreground">
							{t(`home.steps.items.${step.id}.title`)}
						</h3>

						<p className="mt-2 text-sm leading-relaxed text-foreground/55">
							{t(`home.steps.items.${step.id}.description`)}
						</p>
					</li>
				))}
			</ol>
		</section>
	);
}
