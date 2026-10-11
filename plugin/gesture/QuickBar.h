// Quick bar hosted by the Live Gestures AEGP (see QuickBar.mm). All three run on AE's main thread.
#pragma once
void QuickBarStart();
void QuickBarIdle();
void QuickBarStop();
#ifdef _WIN32
// Windows: the bar is an owned popup of AE's main window (AEGP_GetMainHWND), so
// it stays above AE, never above other apps, and hides with AE when minimised.
void QuickBarSetOwner(void* mainWindow);
#endif
