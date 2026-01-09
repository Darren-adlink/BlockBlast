import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Trash2, Check, AlertCircle, Hand, MousePointer2, Undo2, Settings2, Eraser, Cpu, BrainCircuit, X, BookOpen } from 'lucide-react';

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

// --- 保留的難題範例 (死局求生) ---
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
  // 1x2 橫條
  (() => {
    const g = createEmptyGrid(PIECE_GRID_SIZE);
    g[0][0] = true; g[0][1] = true;
    return g;
  })(),
  // 2x2 斜角
  (() => {
    const g = createEmptyGrid(PIECE_GRID_SIZE);
    g[0][0] = true; g[1][1] = true;
    return g;
  })(),
  // 3x3 大方塊
  (() => {
    const g = createEmptyGrid(PIECE_GRID_SIZE);
    for(let r=0; r<3; r++) for(let c=0; c<3; c++) g[r][c] = true;
    return g;
  })()
];

// ==========================================
//  核心引擎：位元矩陣運算 (Bitwise Engine)
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
      grid: grid // 保留原始形狀供 UI 顯示
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

  // --- DFS 求解器 ---
  solve: async (startBoard, pieces) => {
    const boardBB = BitwiseEngine.toBitboard(startBoard);
    
    // 預處理 pieces，轉換為 bitmask 資料結構，並加上 ID 以便追蹤
    const activePieces = pieces
      .map((p, idx) => ({ id: idx, data: BitwiseEngine.getPieceBitmask(p) }))
      .filter(p => p.data !== null);

    if (activePieces.length === 0) return [];

    // 遞迴函數
    const findSolution = (currentBB, remainingPieces, path) => {
      // Base Case: 所有方塊都放完了
      if (remainingPieces.length === 0) {
        return path;
      }

      const currentPiece = remainingPieces[0];
      const others = remainingPieces.slice(1);

      // 嘗試所有位置
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

    // 排列組合產生器
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
    
    // 嘗試每一種順序
    for (let order of orders) {
      const result = findSolution(boardBB, order, []);
      if (result) return result;
    }

    return null; // 無解
  }
};

export default function BlockBlastSolver() {
  // --- 狀態 ---
  const [mode, setMode] = useState('edit'); // 'edit', 'play', 'solving', 'solution'
  const [board, setBoard] = useState(EMPTY_BOARD);
  const [pieces, setPieces] = useState(EMPTY_PIECES);
  
  // Play Mode 狀態
  const [history, setHistory] = useState([]);
  const [selectedPieceIdx, setSelectedPieceIdx] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [initialRoundState, setInitialRoundState] = useState(null);

  // Solution Mode 狀態
  const [solutionSteps, setSolutionSteps] = useState(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [solverError, setSolverError] = useState("");

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

  // 載入範例題目
  const loadSample = () => {
    if (window.confirm("確定要載入範例難題嗎？目前的繪製會被覆蓋。")) {
      setBoard(cloneGrid(SAMPLE_BOARD));
      setPieces(SAMPLE_PIECES.map(p => cloneGrid(p)));
      setMode('edit');
      setSolutionSteps(null);
      setHistory([]);
    }
  };

  // --- AI 求解 ---
  const runSolver = async () => {
    setMode('solving');
    setSolverError("");
    
    setTimeout(async () => {
      const result = await BitwiseEngine.solve(board, pieces);
      if (result) {
        setSolutionSteps(result);
        setCurrentStepIdx(0);
        setMode('solution');
        setInitialRoundState({
            board: cloneGrid(board),
            pieces: pieces.map(p => cloneGrid(p))
        });
      } else {
        setSolverError("AI 算盡了所有排列組合，發現此局無解！建議檢查題目是否輸入正確。");
        setMode('edit');
      }
    }, 100);
  };

  // --- 手動模擬 ---
  const startSimulation = () => {
    const hasPieces = pieces.some(p => BitwiseEngine.getPieceBitmask(p) !== null);
    if (!hasPieces) {
      alert("請至少繪製一個方塊！");
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

  // --- 預覽邏輯 ---
  const getPreviewCells = () => {
    let targetPiece = null;
    let targetR = -1, targetC = -1;
    let checkValid = false;

    if (mode === 'play' && selectedPieceIdx !== null && hoverPos) {
      targetPiece = pieces[selectedPieceIdx];
      targetR = hoverPos.r;
      targetC = hoverPos.c;
      checkValid = true;
    } else if (mode === 'solution' && solutionSteps) {
      const step = solutionSteps[currentStepIdx];
      targetPiece = initialRoundState.pieces[step.pieceId];
      targetR = step.r;
      targetC = step.c;
      checkValid = false;
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

  // --- 解答演示控制 ---
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
      if (mode === 'solution' && initialRoundState && solutionSteps) {
          if (currentStepIdx === 0) {
              setBoard(initialRoundState.board);
          } else {
              setBoard(BitwiseEngine.fromBitboard(solutionSteps[currentStepIdx - 1].boardAfter));
          }
      }
  }, [currentStepIdx, mode, solutionSteps, initialRoundState]);


  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-4 font-sans text-slate-800 select-none">
      <div className="max-w-md mx-auto">
        
        <header className="mb-4 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center justify-center gap-2">
            Block Blast 終極破解 <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded border border-purple-200 flex items-center gap-1"><BrainCircuit size={12}/> AI 運算</span>
          </h1>
          
          {/* 控制按鈕區 */}
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

            {(mode === 'play' || mode === 'solution') && (
              <button 
                onClick={stopMode}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-full font-bold hover:bg-slate-300 transition-all"
              >
                <Settings2 size={18} /> 回到編輯 / 重置
              </button>
            )}
          </div>
          
          {/* 錯誤訊息 */}
          {solverError && (
             <div className="mt-2 bg-red-100 text-red-700 p-2 rounded text-sm flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
               <AlertCircle size={16} /> {solverError}
             </div>
          )}
        </header>

        {/* 主盤面 */}
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
                  <button onClick={loadSample} className="text-xs text-indigo-600 flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded font-bold">
                    <BookOpen size={14} /> 載入範例難題
                  </button>
                )}
                {mode === 'edit' && (
                <button onClick={clearBoard} className="text-xs text-red-500 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded">
                    <Eraser size={14} /> 清空盤面
                </button>
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

            {mode === 'solution' && (
                <div className="text-sm font-bold text-green-600 flex items-center gap-1">
                    <Check size={16}/> 步驟 {currentStepIdx + 1} / {solutionSteps.length}
                </div>
            )}
          </div>

          {mode === 'solving' && (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
               <Cpu className="animate-spin text-purple-600 mb-2" size={48} />
               <p className="text-purple-800 font-bold">AI 正在嘗試數萬種排列...</p>
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

          {mode === 'solution' && (
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

        {/* 手牌區 */}
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

            {mode === 'solution' && initialRoundState.pieces.map((pieceGrid, idx) => {
                const isCurrentStepPiece = solutionSteps[currentStepIdx].pieceId === idx;
                const isUsed = solutionSteps.slice(0, currentStepIdx).some(step => step.pieceId === idx);

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

      </div>
    </div>
  );
}
