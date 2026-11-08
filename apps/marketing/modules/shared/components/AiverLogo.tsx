import { cn } from "@repo/ui";

export function AiverLogo({ className }: { className?: string }) {
	return (
		<span className={cn("gap-2.5 flex items-center leading-none text-foreground", className)}>
			<svg className="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden>
				<path
					d="M16 4C9.4 4 4 8.4 4 13.8c0 3 1.7 5.6 4.3 7.4L7.2 27l5.8-3c1 .2 2 .3 3 .3 6.6 0 12-4.4 12-9.8S22.6 4 16 4Z"
					fill="var(--touch)"
				/>
				<circle cx="10.5" cy="14" r="1.8" fill="var(--touch-foreground)" />
				<circle cx="16" cy="14" r="1.8" fill="var(--touch-foreground)" />
				<circle cx="21.5" cy="14" r="1.8" fill="var(--touch-foreground)" />
			</svg>
			<span className="font-semibold tracking-tight text-[1.05rem]">AIVER</span>
		</span>
	);
}
