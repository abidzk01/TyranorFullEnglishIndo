package com.core.engine

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/** Resolves launcher-facing engine text without changing the native engine's compatibility locale. */
object EngineUiText {
    /** Resolves [resourceId] in the launcher display language carried by [LaunchContract.UI_LANGUAGE_TAG]. */
    @JvmStatic
    fun get(context: Context?, resourceId: Int, vararg formatArgs: Any?): String {
        if (context == null) return ""
        val localized = localizedContext(context)
        return try {
            localized.getString(resourceId, *formatArgs)
        } catch (_: Throwable) {
            context.getString(resourceId, *formatArgs)
        }
    }

    private fun localizedContext(context: Context): Context {
        val languageTag = (context as? Activity)?.intent?.getStringExtra(LaunchContract.UI_LANGUAGE_TAG)
        if (languageTag.isNullOrBlank()) return context
        return try {
            val configuration = Configuration(context.resources.configuration)
            configuration.setLocale(Locale.forLanguageTag(languageTag))
            context.createConfigurationContext(configuration)
        } catch (_: Throwable) {
            context
        }
    }

    /**
     * The KRKR shell must run with its bundled Chinese locale, but common dialog chrome belongs
     * to the launcher UI. Translate only exact system labels and leave game-authored text intact.
     */
    @JvmStatic
    fun localizeCommonDialogText(context: Context, text: String?): String {
        if (text == null) return ""
        return when (text.trim()) {
            "确定", "确认", "好" -> get(context, R.string.engine_ok)
            "取消" -> get(context, R.string.engine_cancel)
            "是" -> get(context, R.string.engine_yes)
            "否" -> get(context, R.string.engine_no)
            "提示" -> get(context, R.string.engine_prompt)
            "错误" -> get(context, R.string.engine_error)
            else -> text
        }
    }
}
