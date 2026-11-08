import { getTotals } from "./procedures/admin-get-totals";
import { listStores } from "./procedures/admin-list-stores";
import { setMonthlyLimit } from "./procedures/admin-set-monthly-limit";
import { setUsePlatformModel } from "./procedures/admin-set-use-platform-model";
import { bindLine } from "./procedures/bind-line";
import { createFaq } from "./procedures/create-faq";
import { deleteFaq } from "./procedures/delete-faq";
import { disconnectCloudflare } from "./procedures/disconnect-cloudflare";
import { getModelSettings } from "./procedures/get-model-settings";
import { getPersona } from "./procedures/get-persona";
import { getStore } from "./procedures/get-store";
import { getUsage } from "./procedures/get-usage";
import { getWebhookUrl } from "./procedures/get-webhook-url";
import { listConversations } from "./procedures/list-conversations";
import { listFaqs } from "./procedures/list-faqs";
import { listModels } from "./procedures/list-models";
import { saveModelSettings } from "./procedures/save-model-settings";
import { savePersona } from "./procedures/save-persona";
import { updateFaq } from "./procedures/update-faq";

export const botRouter = {
	getStore,
	bindLine,
	getWebhookUrl,
	listFaqs,
	createFaq,
	updateFaq,
	deleteFaq,
	listConversations,
	getUsage,
	getModelSettings,
	saveModelSettings,
	getPersona,
	savePersona,
	listModels,
	disconnectCloudflare,
	admin: {
		listStores,
		getTotals,
		setMonthlyLimit,
		setUsePlatformModel,
	},
};
