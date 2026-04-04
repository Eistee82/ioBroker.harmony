import React, { useState, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, CircularProgress, Alert,
    TextField, List, ListItem, ListItemText, ListItemIcon,
    IconButton, Chip, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import BoltIcon from '@mui/icons-material/Bolt';
import { I18n } from '@iobroker/adapter-react-v5';

interface CapturedCode {
    name: string;
    timestamp: number;
}

interface IRLearningDialogProps {
    open: boolean;
    hubName: string;
    sendCommand: <T>(command: string, payload?: unknown) => Promise<{ success: boolean; data?: T; error?: string }>;
    onClose: () => void;
    onCodesLearned?: (codes: CapturedCode[]) => void;
}

export function IRLearningDialog({ open, hubName, sendCommand, onClose, onCodesLearned }: IRLearningDialogProps): React.JSX.Element {
    const [capturing, setCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [codes, setCodes] = useState<CapturedCode[]>([]);
    const [codeName, setCodeName] = useState('');
    const [captureCount, setCaptureCount] = useState(0);

    const handleStartCapture = useCallback(async () => {
        setError(null);
        const resp = await sendCommand('startIRCapture', { hubName });
        if (resp.success) {
            setCapturing(true);
            setCaptureCount((c) => c + 1);
        } else {
            setError(resp.error || 'Failed to start IR capture');
        }
    }, [hubName, sendCommand]);

    const handleStopCapture = useCallback(async () => {
        await sendCommand('stopIRCapture', { hubName });
        setCapturing(false);
        // Add captured code with the name
        if (codeName.trim()) {
            setCodes((prev) => [...prev, { name: codeName.trim(), timestamp: Date.now() }]);
            setCodeName('');
        }
    }, [hubName, sendCommand, codeName]);

    const handleDeleteCode = useCallback((index: number) => {
        setCodes((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleClose = useCallback(() => {
        if (capturing) {
            void sendCommand('stopIRCapture', { hubName });
        }
        if (codes.length > 0 && onCodesLearned) {
            onCodesLearned(codes);
        }
        setCapturing(false);
        setCodes([]);
        setCaptureCount(0);
        setError(null);
        onClose();
    }, [capturing, codes, hubName, sendCommand, onCodesLearned, onClose]);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6">{I18n.t('irLearning')}</Typography>
                <IconButton size="small" onClick={handleClose}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {I18n.t('irLearningDesc')}
                </Typography>

                {/* Code name input */}
                <TextField
                    label={I18n.t('commandName')}
                    value={codeName}
                    onChange={(e): void => setCodeName(e.target.value)}
                    fullWidth
                    size="small"
                    sx={{ mb: 2 }}
                    placeholder="e.g. PowerToggle, VolumeUp, Mute"
                    disabled={capturing}
                />

                {/* Capture controls */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    {!capturing ? (
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<FiberManualRecordIcon />}
                            onClick={(): void => { void handleStartCapture(); }}
                            disabled={!codeName.trim()}
                            fullWidth
                        >
                            {I18n.t('startCapture')}
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            color="warning"
                            startIcon={<StopIcon />}
                            onClick={(): void => { void handleStopCapture(); }}
                            fullWidth
                        >
                            {I18n.t('stopCapture')}
                        </Button>
                    )}
                </Box>

                {capturing && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'error.50', borderRadius: 1, mb: 2 }}>
                        <CircularProgress size={20} color="error" />
                        <Box>
                            <Typography variant="body2" fontWeight={600} color="error.main">
                                {I18n.t('irCapturing')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {I18n.t('irCapturingDesc')}
                            </Typography>
                        </Box>
                    </Box>
                )}

                {/* Captured codes list */}
                {codes.length > 0 && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            {I18n.t('capturedCodes')} ({codes.length})
                        </Typography>
                        <List dense>
                            {codes.map((code, i) => (
                                <ListItem
                                    key={i}
                                    secondaryAction={
                                        <IconButton size="small" onClick={(): void => handleDeleteCode(i)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    }
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                        <BoltIcon fontSize="small" color="primary" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={code.name}
                                        secondary={new Date(code.timestamp).toLocaleTimeString()}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>{I18n.t('close')}</Button>
            </DialogActions>
        </Dialog>
    );
}
