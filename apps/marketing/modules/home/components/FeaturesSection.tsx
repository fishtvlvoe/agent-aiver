"use client";

import { BookOpenIcon, HeadsetIcon, LayoutDashboardIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

const features = [
	{ id: "knowledge", icon: BookOpenIcon },
	{ id: "unsure", icon: ShieldCheckIcon },
	{ id: "handoff", icon: HeadsetIcon },
	{ id: "dashboard", icon: LayoutDashboardIcon },
];

export function FeaturesSection() {
	const t = useTranslations();

	return (
		<section className="py-16 lg:py-20 container border-t border-border/60">
			<h2 className="font-medium text-2xl sm:text-3xl tracking-tight text-foreground">
				{t("home.features.title")}
			</h2>

			<ul className="mt-10 gap-6 sm:grid-cols-2 grid grid-cols-1">
				{features.map((feature) => (
					<li key={feature.id} className="gap-4 flex items-start">
						<span className="mt-0.5 size-9 shrink-0 rounded-full bg-touch/15 text-touch flex items-center justify-center">
							<feature.icon className="size-4" aria-hidden />
						</span>

						<div>
							<h3 className="font-medium text-foreground">
								{t(`home.features.items.${feature.id}.title`)}
							</h3>
							<p className="mt-1.5 text-sm leading-relaxed text-foreground/55">
								{t(`home.features.items.${feature.id}.description`)}
							</p>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}
