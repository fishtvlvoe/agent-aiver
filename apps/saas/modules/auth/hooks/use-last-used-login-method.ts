"use client";

import { authClient } from "@repo/auth/client";
import { useEffect, useState } from "react";

export function useLastUsedLoginMethod() {
	const [lastUsedLoginMethod, setLastUsedLoginMethod] = useState<string | null>(null);

	useEffect(() => {
		setLastUsedLoginMethod(authClient.getLastUsedLoginMethod());
	}, []);

	return lastUsedLoginMethod;
}
