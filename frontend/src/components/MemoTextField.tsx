import { memo } from 'react';
import { TextField } from '@wso2/oxygen-ui';

/**
 * `TextField` that skips re-rendering when its props are unchanged. Use it for the sibling fields
 * of a form with several controlled inputs (stable `onChange`, hoisted `sx`/`slotProps`).
 *
 * Why: in development MUI's `FormControl` rebuilds its context on every render (its dev-only
 * `registerEffect` is not memoised), so each re-rendered TextField's `InputBase` re-runs a passive
 * effect that calls `setAdornedStart`. Typing re-rendered every sibling TextField, and each
 * keystroke left a pending update behind; when keystrokes arrive faster than React can flush that
 * work (automated input, fast typists, IMEs), React's nested-update counter passes 50 and throws
 * "Maximum update depth exceeded" from the next `setState` — and that keystroke is dropped.
 */
const MemoTextField = memo(TextField);

export default MemoTextField;
