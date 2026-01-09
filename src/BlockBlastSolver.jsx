import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Trash2, Check, AlertCircle, Hand, MousePointer2, Undo2, Settings2, Eraser, Cpu, BrainCircuit, X, BookOpen, Camera, Upload, Scan, Move, ZoomIn, Search, ArrowUp, ArrowDown, Info } from 'lucide-react';

// --- 常數設定 ---
const BOARD_SIZE = 8;
const PIECE_GRID_SIZE = 5;

// --- 輔助函數 ---
const createEmptyGrid = (size) => Array(size).fill(null).map(() => Array(size).fill(false));
const cloneGrid = (grid) => grid.map(row => [...row]);

// --- 預設乾淨狀態 ---
const EMPTY_BOARD = createEmptyGrid(BOARD_SIZE);
const EMPTY_PIECES = [
  createEmptyGrid(PIECE_GRID_SIZE),
  createEmptyGrid(PIECE_GRID_SIZE),
  createEmptyGrid(PIECE_GRID_SIZE)
];

// --- 範例數據 ---
const SAMPLE_BOARD = [
  [0,0,0,1,1,1,1,1],
  [1,0,0,1,0,1,1,1],
  [1,1,1,1,1,0,0,1],
  [1,1,1,1,1,0,0,1],
  [1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,0,0],
  [1,1,0,1,1,1,0,1],
  [1,1,0,0,0,0,0,0]
].map(row => row.map(cell => cell === 1));

const SAMPLE_PIECES = [
  (() => { const g = createEmptyGrid(PIECE_GRID_SIZE); g[0][0]=true; g[0][1]=true; return g; })(),
  (() => { const g = createEmptyGrid(PIECE_GRID_SIZE); g[0][0]=true; g[1][1]=true; return g; })(),
  (() => { const g = createEmptyGrid(PIECE_GRID_SIZE); for(let r=0;r<3;r++) for(let c=0;c<3;c++) g[r][c]=true; return g; })()
];

// ==========================================
//  核心引擎：位元矩陣運算
// ==========================================
const BitwiseEngine = {
  toBitboard: (grid) => {
    let bb = BigInt(0);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (grid[r][c]) {
          bb |= (BigInt(1) << BigInt(r * BOARD_SIZE + c));
        }
      }
    }
    return bb;
  },

  fromBitboard: (bb) => {
    const grid = createEmptyGrid(BOARD_SIZE);
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((bb & (BigInt(1) << BigInt(r * BOARD_SIZE + c))) !== BigInt(0)) {
          grid[r][c] = true;
        }
      }
    }
    return grid;
  },

  getPieceBitmask: (grid) => {
    let mask = BigInt(0);
    let minR = PIECE_GRID_SIZE, maxR = -1;
    let minC = PIECE_GRID_SIZE, maxC = -1;
    let hasBlock = false;

    for (let r = 0; r < PIECE_GRID_SIZE; r++) {
      for (let c = 0; c < PIECE_GRID_SIZE; c++) {
        if (grid[r][c]) {
          hasBlock = true;
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }

    if (!hasBlock) return null;

    for (let r = 0; r < PIECE_GRID_SIZE; r++) {
      for (let c = 0; c < PIECE_GRID_SIZE; c++) {
        if (grid[r][c]) {
          const relR = r - minR;
          const relC = c - minC;
          mask |= (BigInt(1) << BigInt(relR * BOARD_SIZE + relC));
        }
      }
    }

    return {
      mask,
      height: maxR - minR + 1,
      width: maxC - minC + 1,
      grid: grid 
    };
  },

  canPlace: (boardBB, pieceData, r, c) => {
    if (!pieceData) return false;
    if (r + pieceData.height > BOARD_SIZE || c + pieceData.width > BOARD_SIZE) {
      return false;
    }
    const shiftAmount = BigInt(r * BOARD_SIZE + c);
    const placedPiece = pieceData.mask << shiftAmount;
    return (boardBB & placedPiece) === BigInt(0);
  },

  placeAndClear: (boardBB, pieceData, r, c) => {
    const shiftAmount = BigInt(r * BOARD_SIZE + c);
    const placedPiece = pieceData.mask << shiftAmount;
    let nextBoard = boardBB | placedPiece;

    let clearMask = BigInt(0);
    for (let row = 0; row < BOARD_SIZE; row++) {
      const rowMask = BigInt(0xFF) << BigInt(row * BOARD_SIZE);
      if ((nextBoard & rowMask) === rowMask) clearMask |= rowMask;
    }
    const colBaseMask = BigInt("0x0101010101010101");
    for (let col = 0; col < BOARD_SIZE; col++) {
      const colMask = colBaseMask << BigInt(col);
      if ((nextBoard & colMask) === colMask) clearMask |= colMask;
    }

    if (clearMask !== BigInt(0)) {
      nextBoard &= ~clearMask;
    }
    return nextBoard;
  },

  solve: async (startBoard, pieces) => {
    const boardBB = BitwiseEngine.toBitboard(startBoard);
    
    const activePieces = pieces
      .map((p, idx) => ({ id: idx, data: BitwiseEngine.getPieceBitmask(p) }))
      .filter(p => p.data !== null);

    if (activePieces.length === 0) return [];

    const findSolution = (currentBB, remainingPieces, path) => {
      if (remainingPieces.length === 0) {
        return path;
      }

      const currentPiece = remainingPieces[0];
      const others = remainingPieces.slice(1);

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (BitwiseEngine.canPlace(currentBB, currentPiece.data, r, c)) {
            const nextBB = BitwiseEngine.placeAndClear(currentBB, currentPiece.data, r, c);
            const move = {
              pieceId: currentPiece.id,
              r, c,
              boardAfter: nextBB
            };
            
            const result = findSolution(nextBB, others, [...path, move]);
            if (result) return result;
          }
        }
      }
      return null;
    };

    const getPermutations = (arr) => {
      if (arr.length <= 1) return [arr];
      const output = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const perms = getPermutations(remaining);
        for (let p of perms) {
          output.push([current, ...p]);
        }
      }
      return output;
    };

    const orders = getPermutations(activePieces);
    
    for (let order of orders) {
      const result = findSolution(boardBB, order, []);
      if (result) return result;
    }

    return null; // 無解
  }
};

export default function BlockBlastSolver() {
  const [mode, setMode] = useState('edit'); 
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [pieces, setPieces] = useState(EMPTY_PIECES);
  
  // --- Scan Mode 狀態 ---
  const [uploadedImage, setUploadedImage] = useState(null);
  
  // 只保留 Board (紅) 覆蓋層
  const [gridOverlay, setGridOverlay] = useState({ x: 20, y: 100, size: 300 }); 
  
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  // 拖曳狀態
  const [isDragging, setIsDragging] = useState(false); // false, 'move', 'resize'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startX: 0, startSize: 0 });
  
  // Play/Solution 狀態
  const [history, setHistory] = useState([]);
  const [selectedPieceIdx, setSelectedPieceIdx] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [initialRoundState, setInitialRoundState] = useState(null);
  const [solutionSteps, setSolutionSteps] = useState(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [solverError, setSolverError] = useState("");
  const [notification, setNotification] = useState(null); 

  const showToast = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
        setNotification(null);
    }, 3000);
  };

  // --- 操作邏輯 ---
  const toggleBoardCell = (r, c) => {
    if (mode !== 'edit') return;
    const newBoard = cloneGrid(board);
    newBoard[r][c] = !newBoard[r][c];
    setBoard(newBoard);
  };

  const togglePieceCell = (pieceIdx, r, c) => {
    if (mode !== 'edit') return;
    const newPieces = [...pieces];
    newPieces[pieceIdx] = cloneGrid(newPieces[pieceIdx]);
    newPieces[pieceIdx][r][c] = !newPieces[pieceIdx][r][c];
    setPieces(newPieces);
  };

  const clearBoard = () => setBoard(createEmptyGrid(BOARD_SIZE));
  const clearPiece = (idx) => {
    const newPieces = [...pieces];
    newPieces[idx] = createEmptyGrid(PIECE_GRID_SIZE);
    setPieces(newPieces);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setMode('scan');
        // 重置位置
        setGridOverlay({ x: 30, y: 50, size: 280 }); 
      };
      reader.readAsDataURL(file);
    }
    e.target.value = null; 
  };

  // --- 核心掃描 (只掃棋盤 Board) ---
  const analyzePixels = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const scaleX = canvas.width / img.width;
    const scaleY = canvas.height / img.height;

    console.group("🔍 Analysis Start (Board Only)");

    // === 掃描棋盤 (Red) ===
    const boardStartX = gridOverlay.x * scaleX;
    const boardStartY = gridOverlay.y * scaleY;
    const boardCellSize = (gridOverlay.size * scaleX) / 8;
    
    // 收集所有中位數來計算動態閾值
    const boardStats = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      const lineY = Math.floor(boardStartY + r * boardCellSize + boardCellSize / 2);
      if (lineY < 0 || lineY >= canvas.height) continue;
      for (let c = 0; c < BOARD_SIZE; c++) {
        const segStartX = Math.floor(boardStartX + c * boardCellSize);
        const segEndX = Math.floor(boardStartX + (c + 1) * boardCellSize);
        if (segStartX < 0 || segEndX > canvas.width) continue;
        
        const scanHeight = 3; 
        const scanYStart = Math.max(0, lineY - 1);
        const imgData = ctx.getImageData(segStartX, scanYStart, (segEndX - segStartX), scanHeight);
        const stats = getRegionStats(imgData.data);
        boardStats.push({ r, c, ...stats });
      }
    }
    
    const boardThreshold = calculateAdaptiveThreshold(boardStats.map(s => s.b));
    console.log("Board Adaptive Threshold:", boardThreshold);

    const newBoard = createEmptyGrid(BOARD_SIZE);
    boardStats.forEach(stat => {
        // 棋盤判定
        if (stat.b > boardThreshold || stat.s > 75) {
            newBoard[stat.r][stat.c] = true;
        }
    });

    console.groupEnd();

    setBoard(newBoard);
    // 重置手牌，讓使用者自己畫
    setPieces(EMPTY_PIECES.map(p => cloneGrid(p)));
    setMode('edit');
    showToast('success', "棋盤掃描完成！請手動繪製下方方塊。");
  };

  // Helper: 計算區域統計 (中位數)
  const getRegionStats = (data) => {
    const brightnessValues = [];
    const saturationValues = [];
    for (let i = 0; i < data.length; i += 4) {
        const R = data[i], G = data[i+1], B = data[i+2];
        brightnessValues.push((R+G+B)/3);
        saturationValues.push(Math.max(R,G,B) - Math.min(R,G,B));
    }
    brightnessValues.sort((a,b)=>a-b);
    saturationValues.sort((a,b)=>a-b);
    const mid = Math.floor(brightnessValues.length/2);
    return { b: brightnessValues[mid] || 0, s: saturationValues[mid] || 0 };
  };

  // Helper: 計算動態閾值
  const calculateAdaptiveThreshold = (values) => {
      const sorted = [...values].sort((a,b)=>a-b);
      let maxGap = 0, gapIndex = 0;
      // 忽略頭尾 10% 避免極端值
      const start = Math.floor(sorted.length * 0.1);
      const end = Math.floor(sorted.length * 0.9);
      
      for(let i=start; i<end; i++) {
          const gap = sorted[i+1] - sorted[i];
          if(gap > maxGap) { maxGap = gap; gapIndex = i; }
      }
      // 如果斷層不明顯，回退到預設值
      if (maxGap < 10) return 90;
      return (sorted[gapIndex] + sorted[gapIndex+1]) / 2;
  };

  // --- 拖曳邏輯 (僅 Board) ---
  const handleMoveLogic = (clientX, clientY) => {
    if (!isDragging) return;
    
    if (isDragging === 'move') {
        setGridOverlay({
            ...gridOverlay,
            x: clientX - dragStart.x,
            y: clientY - dragStart.y
        });
    } else if (isDragging === 'resize') {
        const delta = clientX - dragStart.startX;
        setGridOverlay({
            ...gridOverlay,
            size: Math.max(100, dragStart.startSize + delta)
        });
    }
  };

  const handleMouseDownMove = (e) => {
    e.stopPropagation();
    setIsDragging('move');
    setDragStart({ x: e.clientX - gridOverlay.x, y: e.clientY - gridOverlay.y, startX: 0, startSize: 0 });
  };
  
  const handleMouseDownResize = (e) => {
     e.stopPropagation();
     setIsDragging('resize');
     setDragStart({ startSize: gridOverlay.size, startX: e.clientX, x: 0, y: 0 });
  };

  const handleTouchStartMove = (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setIsDragging('move');
    setDragStart({ x: touch.clientX - gridOverlay.x, y: touch.clientY - gridOverlay.y, startX: 0, startSize: 0 });
  };

  const handleTouchStartResize = (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setIsDragging('resize');
    setDragStart({ startSize: gridOverlay.size, startX: touch.clientX, x: 0, y: 0 });
  };

  const handleWindowMouseMove = (e) => {
    if (isDragging) handleMoveLogic(e.clientX, e.clientY);
  };

  const handleWindowTouchMove = (e) => {
    if (isDragging) {
        if (e.cancelable) e.preventDefault(); 
        const touch = e.touches[0];
        handleMoveLogic(touch.clientX, touch.clientY);
    }
  };

  const handleWindowEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowEnd);
        window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
        window.addEventListener('touchend', handleWindowEnd);
    } else {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowEnd);
        window.removeEventListener('touchmove', handleWindowTouchMove);
        window.removeEventListener('touchend', handleWindowEnd);
    }
    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowEnd);
        window.removeEventListener('touchmove', handleWindowTouchMove);
        window.removeEventListener('touchend', handleWindowEnd);
    };
  }, [isDragging, gridOverlay]);

  const scrollPage = (amount) => {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  };

  // --- AI 求解 ---
  const runSolver = async () => {
    setMode('solving');
    setSolverError("");
    
    setTimeout(async () => {
      try {
        const hasPieces = pieces.some(p => BitwiseEngine.getPieceBitmask(p) !== null);
        if (!hasPieces) {
             setSolverError("請至少繪製一個方塊！");
             setMode('edit');
             return;
        }

        const result = await BitwiseEngine.solve(board, pieces);
        if (result && result.length > 0) {
          setSolutionSteps(result);
          setCurrentStepIdx(0);
          setMode('solution');
          setInitialRoundState({
              board: cloneGrid(board),
              pieces: pieces.map(p => cloneGrid(p))
          });
        } else {
          setSolverError("AI 運算完畢：無解！");
          setMode('edit');
        }
      } catch (error) {
        console.error(error);
        setSolverError("發生錯誤，請重試。");
        setMode('edit');
      }
    }, 100);
  };

  // --- 手動模擬 ---
  const startSimulation = () => {
    const hasPieces = pieces.some(p => BitwiseEngine.getPieceBitmask(p) !== null);
    if (!hasPieces) {
      showToast('error', "請至少繪製一個方塊！"); // 替換 alert
      return;
    }
    setInitialRoundState({
      board: cloneGrid(board),
      pieces: pieces.map(p => cloneGrid(p))
    });
    setHistory([]);
    setMode('play');
    setSelectedPieceIdx(null);
  };

  const stopMode = () => {
    setMode('edit');
    setSelectedPieceIdx(null);
    setHistory([]);
    setSolutionSteps(null);
    if (initialRoundState) {
        setBoard(initialRoundState.board);
        setPieces(initialRoundState.pieces);
    }
  };

  const loadSample = () => {
    if (window.confirm("載入範例難題？")) {
      setBoard(cloneGrid(SAMPLE_BOARD));
      setPieces(SAMPLE_PIECES.map(p => cloneGrid(p)));
      setMode('edit');
      setSolutionSteps(null);
      setHistory([]);
    }
  };

  // --- 互動邏輯 (Play Mode) ---
  const handleBoardClick = (r, c) => {
    if (mode !== 'play' || selectedPieceIdx === null) return;

    const currentBoardBB = BitwiseEngine.toBitboard(board);
    const pieceData = BitwiseEngine.getPieceBitmask(pieces[selectedPieceIdx]);

    if (BitwiseEngine.canPlace(currentBoardBB, pieceData, r, c)) {
      setHistory([...history, {
        board: cloneGrid(board),
        pieces: pieces.map(p => cloneGrid(p))
      }]);

      const nextBoardBB = BitwiseEngine.placeAndClear(currentBoardBB, pieceData, r, c);
      setBoard(BitwiseEngine.fromBitboard(nextBoardBB));
      
      const newPieces = [...pieces];
      newPieces[selectedPieceIdx] = createEmptyGrid(PIECE_GRID_SIZE);
      setPieces(newPieces);
      setSelectedPieceIdx(null);
      setHoverPos(null);
    }
  };

  const handlePieceSelect = (idx) => {
    if (mode !== 'play') return;
    if (BitwiseEngine.getPieceBitmask(pieces[idx]) === null) return;
    setSelectedPieceIdx(selectedPieceIdx === idx ? null : idx);
  };

  const undoMove = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setBoard(lastState.board);
    setPieces(lastState.pieces);
    setHistory(history.slice(0, -1));
    setSelectedPieceIdx(null);
  };

  const getPreviewCells = () => {
    let targetPiece = null;
    let targetR = -1, targetC = -1;
    let checkValid = false;

    if (mode === 'play' && selectedPieceIdx !== null && hoverPos) {
      targetPiece = pieces[selectedPieceIdx];
      targetR = hoverPos.r;
      targetC = hoverPos.c;
      checkValid = true;
    } else if (mode === 'solution' && solutionSteps && solutionSteps.length > 0) {
      const step = solutionSteps[currentStepIdx];
      if (step && initialRoundState && initialRoundState.pieces && initialRoundState.pieces[step.pieceId]) {
          targetPiece = initialRoundState.pieces[step.pieceId];
          targetR = step.r;
          targetC = step.c;
          checkValid = false;
      }
    }

    if (!targetPiece) return { cells: [], isValid: false, isSolution: false };

    const pieceData = BitwiseEngine.getPieceBitmask(targetPiece);
    if (!pieceData) return { cells: [], isValid: false, isSolution: false };

    const previewCells = [];
    let minR = PIECE_GRID_SIZE, minC = PIECE_GRID_SIZE;
    for(let r=0; r<PIECE_GRID_SIZE; r++) {
        for(let c=0; c<PIECE_GRID_SIZE; c++) {
            if(targetPiece[r][c]) {
                minR = Math.min(minR, r);
                minC = Math.min(minC, c);
            }
        }
    }

    for(let r=0; r<PIECE_GRID_SIZE; r++) {
        for(let c=0; c<PIECE_GRID_SIZE; c++) {
            if(targetPiece[r][c]) {
                const tr = targetR + (r - minR);
                const tc = targetC + (c - minC);
                if (tr >= 0 && tr < BOARD_SIZE && tc >= 0 && tc < BOARD_SIZE) {
                    previewCells.push({ r: tr, c: tc });
                }
            }
        }
    }

    let isValid = true;
    if (checkValid) {
        isValid = BitwiseEngine.canPlace(BitwiseEngine.toBitboard(board), pieceData, targetR, targetC);
    }

    return { cells: previewCells, isValid, isSolution: mode === 'solution' };
  };

  const previewData = getPreviewCells();

  const nextStep = () => {
    if (!solutionSteps) return;
    if (currentStepIdx < solutionSteps.length - 1) {
       setBoard(BitwiseEngine.fromBitboard(solutionSteps[currentStepIdx].boardAfter));
       setCurrentStepIdx(currentStepIdx + 1);
    }
  };
  
  const prevStep = () => {
     if (currentStepIdx > 0) {
       setCurrentStepIdx(currentStepIdx - 1);
       if (currentStepIdx - 1 === 0) {
          setBoard(initialRoundState.board);
       } else {
          setBoard(BitwiseEngine.fromBitboard(solutionSteps[currentStepIdx - 2].boardAfter));
       }
     } else if (currentStepIdx === 0) {
         setBoard(initialRoundState.board);
     }
  };

  useEffect(() => {
      if (mode === 'solution' && initialRoundState && solutionSteps && solutionSteps.length > 0) {
          if (currentStepIdx === 0) {
              setBoard(initialRoundState.board);
          } else if (solutionSteps[currentStepIdx - 1]) {
              setBoard(BitwiseEngine.fromBitboard(solutionSteps[currentStepIdx - 1].boardAfter));
          }
      }
  }, [currentStepIdx, mode, solutionSteps, initialRoundState]);

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-4 font-sans text-slate-800 select-none">
      
      {/* Toast Notification (固定在最上方) */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-5 duration-300 ${
            notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-600 text-white'
        }`}>
            {notification.type === 'error' ? <AlertCircle size={20}/> : <Check size={20}/>}
            <span className="font-bold">{notification.message}</span>
        </div>
      )}

      <div className="max-w-md mx-auto">
        
        <header className="mb-4 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center justify-center gap-2">
            Block Blast 終極破解 <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded border border-purple-200 flex items-center gap-1"><BrainCircuit size={12}/> V2.5</span>
          </h1>
          
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {mode === 'edit' && (
              <>
                <button 
                  onClick={runSolver}
                  className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-full font-bold shadow-lg hover:bg-purple-700 active:scale-95 transition-all"
                >
                  <BrainCircuit size={18} /> AI 計算最佳解
                </button>
                <button 
                  onClick={startSimulation}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  <Play size={18} fill="currentColor"/> 手動模擬
                </button>
              </>
            )}

            {(mode === 'play' || mode === 'solution' || mode === 'scan') && (
              <button 
                onClick={stopMode}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-full font-bold hover:bg-slate-300 transition-all"
              >
                <Settings2 size={18} /> 
                {mode === 'scan' ? '取消掃描' : '回到編輯'}
              </button>
            )}
          </div>
          
          {solverError && (
             <div className="mt-2 bg-red-100 text-red-700 p-2 rounded text-sm flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
               <AlertCircle size={16} /> {solverError}
             </div>
          )}
        </header>

        {/* Scan Mode UI */}
        {mode === 'scan' && uploadedImage && (
             <div className="relative">
                 {/* 上方：圖片編輯區 */}
                 <div className="bg-slate-800 p-2 rounded-xl shadow-lg border border-slate-700 mb-24 relative overflow-hidden text-center select-none touch-none min-h-[500px]">
                    <p className="text-white text-sm mb-2 font-bold flex items-center justify-center gap-2">
                        <Move size={14}/> 拖曳紅框定位
                    </p>
                    
                    <div className="relative inline-block w-full max-w-[350px]">
                        <img 
                            ref={imageRef}
                            src={uploadedImage} 
                            alt="Upload" 
                            className="w-full h-auto rounded opacity-80 pointer-events-none select-none"
                        />
                        
                        {/* Red Overlay (Board Only) */}
                        <div 
                            className="absolute border-2 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 box-border pointer-events-none"
                            style={{
                                left: gridOverlay.x,
                                top: gridOverlay.y,
                                width: gridOverlay.size,
                                height: gridOverlay.size,
                                backgroundImage: `
                                    linear-gradient(to right, rgba(255,0,0,0.3) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(255,0,0,0.3) 1px, transparent 1px)
                                `,
                                backgroundSize: `${gridOverlay.size/8}px ${gridOverlay.size/8}px`
                            }}
                        >
                             <div 
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-red-500/30 rounded-full cursor-move flex items-center justify-center pointer-events-auto active:bg-red-500/60 transition-colors"
                                onMouseDown={handleMouseDownMove}
                                onTouchStart={handleTouchStartMove}
                             >
                                 <Move size={24} className="text-white drop-shadow-md"/>
                             </div>

                             <div 
                                className="absolute bottom-0 right-0 w-8 h-8 bg-red-500 cursor-se-resize flex items-center justify-center rounded-tl opacity-80 pointer-events-auto"
                                onMouseDown={handleMouseDownResize}
                                onTouchStart={handleTouchStartResize}
                             >
                                <ZoomIn size={18} className="text-white pointer-events-none"/>
                             </div>
                             
                             <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded font-bold shadow-md">
                                 棋盤區 (8x8)
                             </div>
                        </div>
                    </div>
                    {/* Hidden Canvas for Processing */}
                    <canvas ref={canvasRef} className="hidden" />
                 </div>

                 {/* 1. 懸浮捲動按鈕 (右下角) */}
                 <div className="fixed right-4 bottom-24 flex flex-col gap-3 z-50">
                    <button 
                        onClick={() => scrollPage(-200)}
                        className="p-3 bg-white/90 text-slate-700 rounded-full shadow-lg border border-slate-200 active:scale-95 active:bg-slate-100"
                        title="向上捲動"
                    >
                        <ArrowUp size={24} />
                    </button>
                    <button 
                        onClick={() => scrollPage(200)}
                        className="p-3 bg-white/90 text-slate-700 rounded-full shadow-lg border border-slate-200 active:scale-95 active:bg-slate-100"
                        title="向下捲動"
                    >
                        <ArrowDown size={24} />
                    </button>
                 </div>

                 {/* 2. 底部固定操作列 (Sticky Footer) */}
                 <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-50 flex gap-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <button 
                        onClick={stopMode}
                        className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 active:scale-95 transition-all"
                    >
                        取消
                    </button>
                    <button 
                        onClick={analyzePixels}
                        className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Scan size={20} /> 掃描分析 (僅棋盤)
                    </button>
                 </div>
             </div>
        )}


        {/* 主盤面 (Edit/Play/Solution Mode) */}
        {mode !== 'scan' && (
        <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 mb-6 relative">
          
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {mode === 'edit' && 'Edit Mode'}
              {mode === 'play' && 'Sandbox Mode'}
              {mode === 'solving' && 'Thinking...'}
              {mode === 'solution' && 'Solution Found'}
            </span>
            
            <div className="flex gap-2">
                {mode === 'edit' && (
                  <>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleFileUpload}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="text-xs bg-slate-100 text-slate-700 flex items-center gap-1 hover:bg-slate-200 px-3 py-1 rounded font-bold border border-slate-300 transition-colors"
                    >
                        <Camera size={14} /> 上傳
                    </button>
                    <button onClick={loadSample} className="text-xs text-indigo-600 flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded font-bold">
                        <BookOpen size={14} /> 範例
                    </button>
                    <button onClick={clearBoard} className="text-xs text-red-500 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded">
                        <Eraser size={14} /> 清空
                    </button>
                  </>
                )}
            </div>
            
            {mode === 'play' && (
               <button 
                onClick={undoMove}
                disabled={history.length === 0}
                className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:bg-blue-50 px-3 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Undo2 size={16} /> 上一步
              </button>
            )}

            {mode === 'solution' && solutionSteps && (
                <div className="text-sm font-bold text-green-600 flex items-center gap-1">
                    <Check size={16}/> 步驟 {currentStepIdx + 1} / {solutionSteps.length}
                </div>
            )}
          </div>

          {mode === 'solving' && (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-300">
               <Cpu className="animate-spin text-purple-600 mb-2" size={48} />
               <p className="text-purple-800 font-bold">矩陣運算中...</p>
               <p className="text-xs text-slate-500 mt-1">計算所有可能的消除路徑</p>
            </div>
          )}

          <div 
            className="grid gap-1 bg-slate-200 p-2 rounded-lg touch-none"
            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHoverPos(null)}
          >
            {board.map((row, r) => (
              row.map((cell, c) => {
                let isPreview = false;
                let isValidPreview = false;
                let isSolutionHint = false;

                if (previewData.cells.length > 0) {
                   const found = previewData.cells.find(p => p.r === r && p.c === c);
                   if (found) {
                     isPreview = true;
                     isValidPreview = previewData.isValid;
                     isSolutionHint = previewData.isSolution;
                   }
                }

                return (
                  <div
                    key={`board-${r}-${c}`}
                    onMouseDown={() => {
                        if (mode === 'edit') toggleBoardCell(r, c);
                        if (mode === 'play') handleBoardClick(r, c);
                    }}
                    onMouseEnter={() => setHoverPos({ r, c })}
                    className={`
                      aspect-square border rounded-md transition-all duration-200 flex items-center justify-center
                      ${cell 
                        ? 'bg-blue-600 border-blue-700 shadow-sm z-10' 
                        : (isPreview 
                            ? (isSolutionHint 
                                ? 'bg-green-500 animate-pulse border-green-600 shadow-[0_0_10px_rgba(34,197,94,0.6)] z-20' 
                                : (isValidPreview ? 'bg-green-400 opacity-60' : 'bg-red-400 opacity-60'))
                            : 'bg-white border-slate-300 hover:bg-slate-50')}
                      ${(mode === 'play' && !cell) || mode === 'edit' ? 'cursor-pointer' : ''}
                    `}
                  >
                     {isSolutionHint && <div className="w-2 h-2 bg-white rounded-full opacity-80" />}
                  </div>
                );
              })
            ))}
          </div>

          {mode === 'solution' && solutionSteps && (
             <div className="mt-4 flex justify-between gap-4">
                <button 
                  onClick={prevStep} 
                  disabled={currentStepIdx === 0}
                  className="flex-1 py-2 bg-slate-100 rounded text-slate-600 disabled:opacity-30 hover:bg-slate-200"
                >
                  上一步
                </button>
                <button 
                  onClick={nextStep}
                  disabled={currentStepIdx === solutionSteps.length - 1}
                  className="flex-1 py-2 bg-purple-600 text-white rounded font-bold disabled:opacity-50 hover:bg-purple-700"
                >
                  {currentStepIdx === solutionSteps.length - 1 ? '完成' : '下一步'}
                </button>
             </div>
          )}

        </div>
        )}

        {/* 手牌區 (僅在非 Scan Mode 顯示) */}
        {mode !== 'scan' && (
        <div className="bg-slate-100 p-4 rounded-xl shadow-inner border border-slate-200">
          <div className="flex justify-between items-center mb-3">
             <h2 className="font-bold text-slate-700 flex items-center gap-2">
               <Hand size={18} /> 手牌區
             </h2>
             {mode === 'solution' && (
                 <span className="text-xs text-green-600 font-bold">跟隨上方綠色提示操作</span>
             )}
          </div>

          <div className="flex justify-center gap-3 sm:gap-6">
            {(mode !== 'solution') && pieces.map((pieceGrid, idx) => {
              const isEmpty = BitwiseEngine.getPieceBitmask(pieceGrid) === null;
              const isSelected = selectedPieceIdx === idx;

              return (
                <div 
                  key={idx} 
                  className={`
                    relative flex flex-col items-center transition-all duration-200
                    ${mode === 'play' && isSelected ? 'scale-110 -translate-y-2' : ''}
                    ${mode === 'play' && !isSelected && !isEmpty ? 'hover:scale-105 cursor-pointer' : ''}
                    ${mode === 'play' && selectedPieceIdx !== null && !isSelected ? 'opacity-40' : 'opacity-100'}
                  `}
                  onClick={() => handlePieceSelect(idx)}
                >
                  <div 
                    className={`
                      grid gap-px bg-white border-2 p-1 rounded-lg
                      ${isSelected ? 'border-green-500 shadow-xl ring-2 ring-green-200' : 'border-slate-300 shadow-sm'}
                      ${isEmpty && mode === 'play' ? 'opacity-0 pointer-events-none' : ''}
                    `}
                    style={{ gridTemplateColumns: `repeat(${PIECE_GRID_SIZE}, minmax(0, 1fr))` }}
                  >
                    {pieceGrid.map((row, r) => (
                      row.map((cell, c) => (
                        <div
                          key={`p-${idx}-${r}-${c}`}
                          onMouseDown={(e) => {
                            if (mode === 'edit') {
                              e.stopPropagation();
                              togglePieceCell(idx, r, c);
                            }
                          }}
                          className={`
                            w-3 h-3 sm:w-4 sm:h-4 rounded-sm
                            ${cell ? 'bg-indigo-500' : 'bg-slate-50'}
                            ${mode === 'edit' ? 'cursor-pointer hover:bg-slate-200' : ''}
                          `}
                        />
                      ))
                    ))}
                  </div>
                  {mode === 'edit' && !isEmpty && (
                     <button 
                       onClick={(e) => { e.stopPropagation(); clearPiece(idx); }}
                       className="absolute -top-2 -right-2 bg-white text-slate-400 border border-slate-200 rounded-full p-1 hover:text-red-500 shadow-sm"
                     >
                       <X size={10} />
                     </button>
                  )}
                </div>
              );
            })}

            {mode === 'solution' && solutionSteps && initialRoundState.pieces.map((pieceGrid, idx) => {
                const step = solutionSteps[currentStepIdx];
                const isCurrentStepPiece = step ? step.pieceId === idx : false;
                const isUsed = solutionSteps.slice(0, currentStepIdx).some(s => s.pieceId === idx);

                return (
                    <div 
                      key={`sol-p-${idx}`}
                      className={`
                        relative flex flex-col items-center transition-all duration-300
                        ${isCurrentStepPiece ? 'scale-110 -translate-y-1 opacity-100' : (isUsed ? 'opacity-20 grayscale' : 'opacity-60')}
                      `}
                    >
                        <div className={`text-[10px] mb-1 font-bold ${isCurrentStepPiece ? 'text-green-600' : 'text-transparent'}`}>
                            當前使用
                        </div>
                        <div 
                            className={`
                            grid gap-px bg-white border-2 p-1 rounded-lg
                            ${isCurrentStepPiece ? 'border-green-500 ring-2 ring-green-200' : 'border-slate-200'}
                            `}
                            style={{ gridTemplateColumns: `repeat(${PIECE_GRID_SIZE}, minmax(0, 1fr))` }}
                        >
                            {pieceGrid.map((row, r) => (
                            row.map((cell, c) => (
                                <div
                                key={`sol-p-${idx}-${r}-${c}`}
                                className={`
                                    w-3 h-3 sm:w-4 sm:h-4 rounded-sm
                                    ${cell ? 'bg-indigo-500' : 'bg-slate-50'}
                                `}
                                />
                            ))
                            ))}
                        </div>
                    </div>
                )
            })}
          </div>
        </div>
        )}

      </div>
    </div>
  );
}
