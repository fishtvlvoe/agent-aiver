import { AppWrapper } from "@shared/components/AppWrapper";
import type { PropsWithChildren } from "react";

// Outside `(main)` so a lapsed subscription can still open billing to fix payment.
export default function UserBillingLayout({ children }: PropsWithChildren) {
	return <AppWrapper>{children}</AppWrapper>;
}
