/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Volume2, Trophy, BrainCircuit, Rocket, Plus, 
  GripVertical, Network, ShieldQuestion, Swords, Edit3, 
  Loader2, Sparkles, BookOpen, Layers, Save, History, 
  ChevronRight, Calendar, MessageSquare, Lightbulb, GraduationCap,
  PenTool, CheckCircle2, Book, X, Search, Layout, Trash2,
  Maximize2, Minimize2, Palette, MousePointer2, Type, Square, Circle, ArrowRight,
  Check, User as UserIcon
} from 'lucide-react';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  User,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit,
  getDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { Excalidraw } from "@excalidraw/excalidraw";
import { googleAuth } from './lib/googleAuth';

import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";

import { auth, db } from './lib/firebase';
import { cn } from './lib/utils';

import confetti from 'canvas-confetti';

// --- Utilities ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- Types ---
interface WordDetail {
  word: string;
  translation: string;
  synonyms: string[];
  antonym: string;
  sentence: string;
  mnemonic: string;
  emoji: string;
  imageUrl?: string;
  nextReviewDate?: any;
  reviewLevel?: number;
  id?: string;
}

interface GrammarRule {
  id?: string;
  title: string;
  content: string;
  feedback?: string;
  addedAt?: any;
}

interface AdventureStep {
  text: string;
  options: { text: string; nextPrompt: string }[];
}

interface AdventureData {
  story: string;
  wordsDetails: WordDetail[];
  quiz: { question: string; options: string[]; answer: string }[];
  adventure: AdventureStep;
}

// --- Background Particles ---
const BackgroundParticles = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute inset-0 bg-[#0a0f1e]" />
    {[...Array(20)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-1 h-1 bg-sky-500/20 rounded-full"
        initial={{ 
          x: Math.random() * 100 + "%", 
          y: Math.random() * 100 + "%",
          opacity: Math.random()
        }}
        animate={{ 
          y: [null, "-100%"],
          opacity: [0, 1, 0]
        }}
        transition={{ 
          duration: Math.random() * 10 + 10, 
          repeat: Infinity, 
          ease: "linear" 
        }}
      />
    ))}
  </div>
);

// --- Components ---

const VocabularyLab = ({ user, onAddPoints }: { user: User; onAddPoints: (p: number) => void }) => {
  const [inputText, setInputText] = useState('');
  const [pendingWords, setPendingWords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [adventure, setAdventure] = useState<AdventureData | null>(null);
  const [currentStep, setCurrentStep] = useState<AdventureStep | null>(null);
  const [quizIndex, setQuizIndex] = useState(-1);

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const handleAddWord = () => {
    if (!inputText.trim()) return;
    setPendingWords([...pendingWords, inputText.trim()]);
    setInputText('');
    // Jump effect handled by motion
  };

  const handleLaunch = async () => {
    if (pendingWords.length === 0) return;
    setIsLoading(true);
    try {
      const prompt = `Create an English learning adventure and detailed analysis for these words: ${pendingWords.join(', ')}.
      Return a JSON object:
      {
        "story": "A short engaging story using all words",
        "wordsDetails": [
          { 
            "word": "word", 
            "translation": "Arabic", 
            "synonyms": ["syn1", "syn2", "syn3"], 
            "antonym": "antonym", 
            "sentence": "A short sentence using the word", 
            "mnemonic": "Arabic memory trick", 
            "emoji": "🚀",
            "imagePrompt": "A simple descriptive prompt for an AI image generator to visualize this word"
          }
        ],
        "quiz": [
          { "question": "Question about a word", "options": ["A", "B", "C"], "answer": "Correct Option" }
        ],
        "adventure": {
          "text": "The start of an RPG adventure",
          "options": [
            { "text": "Decision 1", "nextPrompt": "What happens if they choose this" },
            { "text": "Decision 2", "nextPrompt": "What happens if they choose that" }
          ]
        }
      }`;
      
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      
      const rawText = result.text?.replace(/```json|```/g, '').trim() || '{}';
      const data = JSON.parse(rawText);
      
      // Add AI Image URLs and Spaced Repetition metadata
      const enrichedWords = data.wordsDetails.map((w: any) => ({
        ...w,
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(w.imagePrompt || w.word)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 1000)}`,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Review in 1 day
        reviewLevel: 1
      }));

      setAdventure({ ...data, wordsDetails: enrichedWords });
      setCurrentStep(data.adventure);
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#0ea5e9', '#facc15', '#22c55e']
      });

      // Save words to Firebase (Word Bank)
      const bankRef = collection(db, 'users', user.uid, 'wordbank');
      for (const w of enrichedWords) {
        await addDoc(bankRef, { ...w, addedAt: serverTimestamp() });
      }
      
      onAddPoints(pendingWords.length * 15);
      setPendingWords([]);
    } catch (error) {
      console.error('Launch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative z-10 space-y-8 max-w-4xl mx-auto">
      {!adventure ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/80 backdrop-blur-2xl border-4 border-sky-500/30 p-10 rounded-[3rem] shadow-[0_0_50px_-12px_rgba(14,165,233,0.5)]"
        >
          <div className="text-center mb-10">
            <motion.div 
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4 }}
              className="w-24 h-24 bg-gradient-to-br from-sky-500 to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-white shadow-2xl"
            >
              <Rocket size={48} />
            </motion.div>
            <h2 className="text-4xl font-black text-white mb-3 tracking-tight">Adventure Launcher</h2>
            <p className="text-slate-400 text-lg">Collect words to build your custom RPG quest.</p>
          </div>

          <div className="flex gap-4 mb-10">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddWord()}
              placeholder="Enter a new word..."
              className="flex-1 bg-slate-800/80 border-2 border-slate-700 rounded-2xl px-8 py-5 text-xl text-white outline-none focus:border-sky-500 transition-all shadow-inner"
            />
            <button 
              onClick={handleAddWord}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-8 rounded-2xl font-black text-xl transition-all active:scale-90 shadow-lg"
            >
              ADD
            </button>
          </div>

          <div className="flex flex-wrap gap-4 mb-12 min-h-[100px] p-6 bg-slate-800/30 rounded-3xl border-2 border-dashed border-slate-700">
            <AnimatePresence>
              {pendingWords.map((w, i) => (
                <motion.div 
                  key={i}
                  layout
                  initial={{ y: 50, opacity: 0, scale: 0.5 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1.1 }}
                  className="bg-sky-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-3 shadow-xl cursor-grab active:cursor-grabbing"
                >
                  <span onClick={() => speak(w)} className="cursor-pointer hover:text-yellow-200 transition-colors">
                    <Volume2 size={18} />
                  </span>
                  {w}
                  <button onClick={() => setPendingWords(pendingWords.filter((_, idx) => idx !== i))} className="text-sky-200 hover:text-white">
                    <X size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {pendingWords.length === 0 && (
              <div className="w-full flex items-center justify-center text-slate-600 font-bold italic">
                No words in the queue...
              </div>
            )}
          </div>

          <button 
            onClick={handleLaunch}
            disabled={pendingWords.length === 0 || isLoading}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white py-6 rounded-[2rem] font-black text-2xl shadow-2xl shadow-green-500/30 flex items-center justify-center gap-4 disabled:opacity-50 transition-all group"
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Rocket className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
            {isLoading ? 'PREPARING ADVENTURE...' : 'LAUNCH MISSION 🚀'}
          </button>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* RPG Adventure Mode */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/90 border-4 border-yellow-500/50 p-8 rounded-[3rem] shadow-2xl"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-yellow-500 text-slate-900 rounded-2xl">
                <Swords size={24} />
              </div>
              <h3 className="text-2xl font-black text-white">Quest: The Word Master</h3>
            </div>
            
            <div className="bg-slate-800/50 p-8 rounded-3xl mb-8 border border-slate-700">
              <p className="text-xl text-slate-200 leading-relaxed font-medium">
                {currentStep?.text}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentStep?.options.map((opt, i) => (
                <button 
                  key={i}
                  onClick={async () => {
                    setIsLoading(true);
                    const res = await ai.models.generateContent({
                      model: 'gemini-3-flash-preview',
                      contents: `Continue the RPG story. Choice was: ${opt.text}. Context: ${opt.nextPrompt}. Keep it short and provide 2 new options.`
                    });
                    const next = JSON.parse(res.text?.replace(/```json|```/g, '').trim() || '{}');
                    setCurrentStep(next.adventure || next);
                    setIsLoading(false);
                  }}
                  className="bg-slate-800 hover:bg-sky-600 text-white p-5 rounded-2xl font-bold text-left border-2 border-slate-700 hover:border-sky-400 transition-all"
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Story & Vocabulary */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-slate-900/80 border-4 border-sky-500/30 p-8 rounded-[3rem]">
              <h4 className="text-xl font-black text-sky-400 mb-4 flex items-center gap-2">
                <Book size={20} /> The Story
              </h4>
              <p className="text-slate-300 leading-relaxed">{adventure.story}</p>
            </div>
            
            <div className="bg-slate-900/80 border-4 border-green-500/30 p-8 rounded-[3rem]">
              <h4 className="text-xl font-black text-green-400 mb-4 flex items-center gap-2">
                <BrainCircuit size={20} /> Word Family Network
              </h4>
              <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                {adventure.wordsDetails.map((w, i) => (
                  <motion.div 
                    key={i} 
                    whileHover={{ scale: 1.02 }}
                    className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{w.emoji}</span>
                        <div>
                          <h5 className="text-xl font-black text-white">{w.word}</h5>
                          <p className="text-sky-400 font-bold">{w.translation}</p>
                        </div>
                      </div>
                      <button onClick={() => speak(w.word)} className="p-2 bg-slate-700 rounded-xl text-sky-400 hover:text-white transition-all">
                        <Volume2 size={20} />
                      </button>
                    </div>

                    {w.imageUrl && (
                      <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-slate-700">
                        <img 
                          src={w.imageUrl} 
                          alt={w.word} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                        <span className="absolute bottom-3 left-4 text-[10px] font-black text-white/50 uppercase tracking-widest">AI Visualization</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                        <p className="text-[10px] font-black text-green-500 uppercase mb-1">Synonyms</p>
                        <p className="text-xs text-slate-300">{w.synonyms.join(' • ')}</p>
                      </div>
                      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                        <p className="text-[10px] font-black text-red-500 uppercase mb-1">Antonym</p>
                        <p className="text-xs text-slate-300">{w.antonym}</p>
                      </div>
                    </div>

                    <div className="bg-sky-500/10 p-4 rounded-xl border border-sky-500/20">
                      <p className="text-[10px] font-black text-sky-400 uppercase mb-1">Context Sentence</p>
                      <p className="text-sm text-slate-200 italic">"{w.sentence}"</p>
                    </div>

                    <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                      <p className="text-[10px] font-black text-yellow-500 uppercase mb-1">Mnemonic Trick</p>
                      <p className="text-sm text-slate-200 font-arabic">{w.mnemonic}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={() => setAdventure(null)}
            className="w-full py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:text-white transition-all"
          >
            START NEW MISSION
          </button>
        </div>
      )}
    </div>
  );
};

const NotionWorkspace = ({ user }: { user: User }) => {
  const [mode, setMode] = useState<'editor' | 'whiteboard' | 'history'>('editor');
  const [blocks, setBlocks] = useState<any[] | null>(null);
  const [excalidrawElements, setExcalidrawElements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [historyNotes, setHistoryNotes] = useState<any[]>([]);

  // Initialize BlockNote editor
  const editor = useCreateBlockNote({
    initialContent: blocks || undefined,
  });

  // Load history
  useEffect(() => {
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setHistoryNotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user.uid]);

  const saveToCloud = async () => {
    setIsSaving(true);
    try {
      const notesRef = collection(db, 'users', user.uid, 'notes');
      await addDoc(notesRef, {
        title: `Master Lab Notes - ${new Date().toLocaleDateString()}`,
        blocks: editor.document,
        excalidrawElements,
        createdAt: serverTimestamp()
      });
      confetti({ particleCount: 100, spread: 70 });
      setMode('history');
    } catch (error) {
      console.error('Cloud save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const loadNote = (note: any) => {
    if (note.blocks && note.blocks.length > 0) {
      editor.replaceBlocks(editor.document, note.blocks);
    }
    if (note.excalidrawElements) {
      setExcalidrawElements(note.excalidrawElements);
    }
    setMode('editor');
  };

  const deleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  // Load current session content from Firestore
  useEffect(() => {
    const docRef = doc(db, 'users', user.uid, 'studio', 'content');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.blocks && !blocks) {
          setBlocks(data.blocks);
        }
        if (data.excalidrawElements) {
          setExcalidrawElements(data.excalidrawElements);
        }
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, [user.uid]);

  // Save current session content to Firestore (debounced)
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(async () => {
      try {
        const currentBlocks = JSON.parse(JSON.stringify(editor.document));
        const docRef = doc(db, 'users', user.uid, 'studio', 'content');
        await setDoc(docRef, { 
          blocks: currentBlocks, 
          excalidrawElements,
          updatedAt: serverTimestamp() 
        }, { merge: true });
      } catch (error) {
        console.error('Studio save failed:', error);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [editor.document, excalidrawElements, user.uid, isLoading]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-sky-500" size={48} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6 relative z-10">
      {/* Workspace Header */}
      <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border-4 border-slate-800 p-4 rounded-[2rem] shadow-2xl">
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-xl transition-all",
            mode === 'editor' ? "bg-sky-500 text-white" : 
            mode === 'whiteboard' ? "bg-purple-500 text-white" : "bg-emerald-500 text-white"
          )}>
            {mode === 'editor' ? <Type size={24} /> : 
             mode === 'whiteboard' ? <Palette size={24} /> : <History size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">
              {mode === 'editor' ? 'Notion Studio' : 
               mode === 'whiteboard' ? 'Creative Canvas' : 'Cloud History'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
              {mode === 'editor' ? 'Structured Learning' : 
               mode === 'whiteboard' ? 'Visual Mind Mapping' : 'Saved Sessions'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={saveToCloud}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            SAVE TO CLOUD
          </button>

          <div className="flex bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
            <button 
              onClick={() => setMode('editor')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                mode === 'editor' ? "bg-sky-500 text-white shadow-lg" : "text-slate-400 hover:text-white"
              )}
            >
              <Layout size={16} /> EDITOR
            </button>
            <button 
              onClick={() => setMode('whiteboard')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                mode === 'whiteboard' ? "bg-purple-500 text-white shadow-lg" : "text-slate-400 hover:text-white"
              )}
            >
              <Palette size={16} /> CANVAS
            </button>
            <button 
              onClick={() => setMode('history')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                mode === 'history' ? "bg-emerald-500 text-white shadow-lg" : "text-slate-400 hover:text-white"
              )}
            >
              <History size={16} /> HISTORY
            </button>
          </div>
        </div>
      </div>

      {/* Workspace Content */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {mode === 'editor' && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="absolute inset-0 bg-[#1e293b] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-slate-900"
            >
              <div className="h-full overflow-y-auto custom-scroll p-8 text-white">
                <BlockNoteView 
                  editor={editor} 
                  theme="dark"
                  className="min-h-full"
                />
              </div>
            </motion.div>
          )}
          
          {mode === 'whiteboard' && (
            <motion.div 
              key="canvas"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="absolute inset-0 bg-slate-900 rounded-[3rem] overflow-hidden border-8 border-slate-900 shadow-2xl"
            >
              <div className="w-full h-full">
                <Excalidraw 
                  theme="dark"
                  initialData={{
                    elements: excalidrawElements,
                    appState: { viewBackgroundColor: "#0f172a", currentItemFontFamily: 1 }
                  }}
                  onChange={(elements) => setExcalidrawElements(elements as any)}
                />
              </div>
            </motion.div>
          )}

          {mode === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl rounded-[3rem] overflow-hidden border-8 border-slate-900 shadow-2xl p-8"
            >
              <div className="h-full overflow-y-auto custom-scroll pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {historyNotes.map((note) => (
                    <div key={note.id} className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-6 flex flex-col gap-4 hover:border-emerald-500 transition-colors group">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-white font-bold text-lg">{note.title}</h3>
                          <p className="text-slate-400 text-xs mt-1">
                            {note.createdAt?.toDate().toLocaleString()}
                          </p>
                        </div>
                        <button 
                          onClick={() => deleteNote(note.id)}
                          className="text-slate-500 hover:text-red-500 transition-colors p-2"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      
                      <div className="flex gap-2 mt-auto">
                        <button 
                          onClick={() => loadNote(note)}
                          className="flex-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white py-3 rounded-xl font-bold text-sm transition-all"
                        >
                          LOAD SESSION
                        </button>
                      </div>
                    </div>
                  ))}
                  {historyNotes.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center text-slate-500 py-20">
                      <History size={64} className="mb-4 opacity-50" />
                      <p className="text-xl font-bold">No saved sessions yet.</p>
                      <p className="text-sm mt-2">Save your work to the cloud to see it here.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Tips */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none z-50">
        <div className="bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-xl text-[10px] font-bold text-slate-400 flex items-center gap-2 shadow-xl">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Auto-saving session
        </div>
      </div>
    </div>
  );
};

const GrammarWorkspace = ({ user, onAddPoints }: { user: User; onAddPoints: (p: number) => void }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSave = async () => {
    if (!title || !content) return;
    try {
      const ruleRef = collection(db, 'users', user.uid, 'grammarbank');
      await addDoc(ruleRef, {
        title,
        content,
        feedback,
        addedAt: serverTimestamp()
      });
      setTitle('');
      setContent('');
      setFeedback('');
      onAddPoints(20);
      confetti({ particleCount: 50, spread: 40, colors: ['#a855f7', '#facc15'] });
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  const handleAIReview = async () => {
    if (!content) return;
    setIsAnalyzing(true);
    try {
      const prompt = `Review this English grammar rule/note:
      Title: ${title}
      Content: ${content}
      
      Provide a professional review in Arabic. Correct any mistakes, provide 3 clear examples, and give a score out of 10. Format with clear headings.`;
      
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setFeedback(result.text || '');
    } catch (error) {
      console.error('Review failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8 h-full relative z-10">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-slate-900/80 backdrop-blur-2xl border-4 border-purple-500/30 p-10 rounded-[3rem] flex flex-col shadow-2xl"
      >
        <div className="flex items-center gap-4 mb-10">
          <div className="p-4 bg-purple-500 text-white rounded-2xl shadow-lg">
            <PenTool size={28} />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">Rule Summarizer</h2>
        </div>

        <div className="space-y-6 flex-1">
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rule Title (e.g., Present Perfect)"
            className="w-full bg-slate-800/80 border-2 border-slate-700 rounded-2xl px-8 py-5 text-xl text-white outline-none focus:border-purple-500 transition-all font-bold shadow-inner"
          />
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the rule summary in your own words..."
            className="w-full h-80 bg-slate-800/80 border-2 border-slate-700 rounded-2xl px-8 py-5 text-lg text-white outline-none focus:border-purple-500 transition-all resize-none custom-scroll shadow-inner"
          />
        </div>

        <div className="flex gap-4 mt-10">
          <button 
            onClick={handleAIReview}
            disabled={!content || isAnalyzing}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-purple-400 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50 border-2 border-slate-700"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
            AI REVIEW
          </button>
          <button 
            onClick={handleSave}
            disabled={!title || !content}
            className="px-12 bg-purple-600 hover:bg-purple-500 text-white py-5 rounded-2xl font-black text-lg transition-all disabled:opacity-50 shadow-xl shadow-purple-500/20"
          >
            SAVE
          </button>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-slate-900/40 border-4 border-slate-800 rounded-[3rem] p-10 overflow-y-auto custom-scroll shadow-2xl"
      >
        {!feedback ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 space-y-6">
            <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center animate-float">
              <MessageSquare size={48} />
            </div>
            <p className="max-w-[250px] text-lg font-bold">AI feedback and corrections will appear here after review.</p>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none text-right">
            <div className="flex items-center justify-between mb-8 border-b-2 border-slate-800 pb-6">
              <span className="bg-purple-500/20 text-purple-400 px-5 py-2 rounded-full text-sm font-black uppercase tracking-widest">AI Analysis Report</span>
              <button onClick={() => setFeedback('')} className="text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
            </div>
            <div className="text-slate-200 leading-relaxed whitespace-pre-wrap font-arabic text-lg">
              {feedback}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// Removed old Whiteboard component in favor of Excalidraw integration in NotionWorkspace

const FlashcardStudy = ({ user, onAddPoints }: { user: User; onAddPoints: (p: number) => void }) => {
  const [dueWords, setDueWords] = useState<WordDetail[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    const wordsRef = collection(db, 'users', user.uid, 'wordbank');
    // In a real app, we'd query by nextReviewDate <= now
    // For this demo, we'll just take words that have a nextReviewDate
    const q = query(wordsRef, orderBy('addedAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (s) => {
      const all = s.docs.map(d => ({ id: d.id, ...d.data() } as WordDetail));
      const due = all.filter(w => w.nextReviewDate);
      setDueWords(due);
    });
    return () => unsub();
  }, [user]);

  const handleReview = async (quality: 'hard' | 'good' | 'easy') => {
    const word = dueWords[currentIndex];
    if (!word.id) return;

    let interval = 1;
    let level = word.reviewLevel || 1;

    if (quality === 'easy') {
      level += 1;
      interval = Math.pow(2, level);
    } else if (quality === 'good') {
      interval = Math.pow(1.5, level);
    } else {
      level = Math.max(1, level - 1);
      interval = 1;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    await updateDoc(doc(db, 'users', user.uid, 'wordbank', word.id), {
      nextReviewDate: nextDate,
      reviewLevel: level
    });

    onAddPoints(5);
    
    if (currentIndex < dueWords.length - 1) {
      setIsFlipped(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  if (dueWords.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-10 relative z-10">
        <div className="w-32 h-32 bg-slate-800/50 rounded-full flex items-center justify-center animate-float mb-8">
          <Sparkles size={64} className="text-yellow-500" />
        </div>
        <h2 className="text-3xl font-black text-white mb-4">All Caught Up!</h2>
        <p className="text-slate-400 max-w-md text-lg">You've reviewed all your words for today. Come back tomorrow to strengthen your mental fortress!</p>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-10 relative z-10">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-green-500/20">
          <Check size={64} className="text-white" />
        </motion.div>
        <h2 className="text-4xl font-black text-white mb-4">Mission Accomplished!</h2>
        <p className="text-slate-400 text-xl mb-10">You've mastered {dueWords.length} words today. +{dueWords.length * 5} XP earned!</p>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-sky-500 hover:bg-sky-400 text-white px-12 py-5 rounded-3xl font-black text-xl transition-all shadow-xl shadow-sky-500/20"
        >
          RETURN TO HUB
        </button>
      </div>
    );
  }

  const currentWord = dueWords[currentIndex];

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-xl">
        <div className="flex justify-between items-center mb-8">
          <span className="text-slate-500 font-black tracking-widest uppercase">Word {currentIndex + 1} of {dueWords.length}</span>
          <div className="flex gap-1">
            {dueWords.map((_, i) => (
              <div key={i} className={cn("h-2 w-8 rounded-full transition-all", i <= currentIndex ? "bg-sky-500" : "bg-slate-800")} />
            ))}
          </div>
        </div>

        <motion.div 
          className="relative h-[500px] w-full perspective-1000 cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <motion.div 
            className="w-full h-full relative transition-all duration-500 preserve-3d"
            animate={{ rotateY: isFlipped ? 180 : 0 }}
          >
            {/* Front */}
            <div className="absolute inset-0 backface-hidden bg-slate-900 border-4 border-slate-800 rounded-[3rem] p-12 flex flex-col items-center justify-center text-center shadow-2xl">
              <span className="text-8xl mb-8 animate-float">{currentWord.emoji}</span>
              <h3 className="text-6xl font-black text-white mb-4 tracking-tighter">{currentWord.word}</h3>
              <p className="text-slate-500 text-xl font-bold uppercase tracking-[0.3em]">Tap to reveal</p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 backface-hidden bg-slate-900 border-4 border-sky-500/30 rounded-[3rem] p-10 flex flex-col rotate-y-180 shadow-2xl overflow-y-auto custom-scroll">
              <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-6">
                <span className="text-5xl">{currentWord.emoji}</span>
                <div>
                  <h3 className="text-3xl font-black text-white">{currentWord.word}</h3>
                  <p className="text-sky-400 font-bold text-xl">{currentWord.translation}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                    <p className="text-xs font-black text-green-500 uppercase mb-2">Synonyms</p>
                    <div className="flex flex-wrap gap-2">
                      {currentWord.synonyms.map((s, i) => (
                        <span key={i} className="text-sm text-slate-300 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-700">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                    <p className="text-xs font-black text-red-500 uppercase mb-2">Antonym</p>
                    <span className="text-sm text-slate-300 bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-700">{currentWord.antonym}</span>
                  </div>
                </div>

                <div className="bg-sky-500/5 p-5 rounded-2xl border border-sky-500/10">
                  <p className="text-xs font-black text-sky-400 uppercase mb-2">Usage</p>
                  <p className="text-lg text-slate-200 italic leading-relaxed">"{currentWord.sentence}"</p>
                </div>

                {currentWord.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border-2 border-slate-800 aspect-video">
                    <img src={currentWord.imageUrl} alt={currentWord.word} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {isFlipped && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-4 mt-10"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); handleReview('hard'); }}
                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-2 border-red-500/20 py-5 rounded-2xl font-black transition-all"
              >
                HARD
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleReview('good'); }}
                className="bg-sky-500/10 hover:bg-sky-500 text-sky-500 hover:text-white border-2 border-sky-500/20 py-5 rounded-2xl font-black transition-all"
              >
                GOOD
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleReview('easy'); }}
                className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white border-2 border-green-500/20 py-5 rounded-2xl font-black transition-all"
              >
                EASY
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const Library = ({ user }: { user: User }) => {
  const [words, setWords] = useState<WordDetail[]>([]);
  const [rules, setRules] = useState<GrammarRule[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'words' | 'rules'>('words');

  useEffect(() => {
    const wordsRef = collection(db, 'users', user.uid, 'wordbank');
    const qWords = query(wordsRef, orderBy('addedAt', 'desc'), limit(50));
    const unsubWords = onSnapshot(qWords, (s) => {
      setWords(s.docs.map(d => ({ id: d.id, ...d.data() } as WordDetail)));
    });

    const rulesRef = collection(db, 'users', user.uid, 'grammarbank');
    const qRules = query(rulesRef, orderBy('addedAt', 'desc'), limit(50));
    const unsubRules = onSnapshot(qRules, (s) => {
      setRules(s.docs.map(d => ({ id: d.id, ...d.data() } as GrammarRule)));
    });

    return () => { unsubWords(); unsubRules(); };
  }, [user]);

  const deleteWord = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'wordbank', id));
  };

  const deleteRule = async (id: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'grammarbank', id));
  };

  return (
    <div className="space-y-10 relative z-10">
      <div className="flex justify-center gap-6">
        <button 
          onClick={() => setActiveSubTab('words')}
          className={cn(
            "px-10 py-4 rounded-2xl text-lg font-black transition-all border-2",
            activeSubTab === 'words' 
              ? "bg-sky-500 text-white border-sky-400 shadow-lg shadow-sky-500/30 scale-105" 
              : "bg-slate-900 text-slate-500 border-slate-800 hover:text-white"
          )}
        >
          WORDS ({words.length})
        </button>
        <button 
          onClick={() => setActiveSubTab('rules')}
          className={cn(
            "px-10 py-4 rounded-2xl text-lg font-black transition-all border-2",
            activeSubTab === 'rules' 
              ? "bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30 scale-105" 
              : "bg-slate-900 text-slate-500 border-slate-800 hover:text-white"
          )}
        >
          RULES ({rules.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'words' ? (
          <motion.div 
            key="words"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {words.map((w) => (
              <motion.div 
                key={w.id} 
                whileHover={{ y: -5 }}
                className="bg-slate-900/80 border-2 border-slate-800 p-8 rounded-[2.5rem] group hover:border-sky-500/50 transition-all relative shadow-xl"
              >
                <button 
                  onClick={() => w.id && deleteWord(w.id)}
                  className="absolute top-6 right-6 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={20} />
                </button>
                <div className="flex items-center gap-5 mb-6">
                  <span className="text-5xl">{w.emoji}</span>
                  <div>
                    <h4 className="text-2xl font-black text-white">{w.word}</h4>
                    <p className="text-sky-400 font-bold">{w.translation}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-400 italic mb-6 line-clamp-2">"{w.sentence}"</p>
                <div className="flex flex-wrap gap-2">
                  {w.synonyms.slice(0, 3).map((s, i) => (
                    <span key={i} className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-xl border border-slate-700">{s}</span>
                  ))}
                </div>
              </motion.div>
            ))}
            {words.length === 0 && (
              <div className="col-span-full py-32 text-center text-slate-600">
                <Layers size={64} className="mx-auto mb-6 opacity-10" />
                <p className="text-xl font-bold">Your word vault is empty. Start your first mission!</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="rules"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {rules.map((r) => (
              <motion.div 
                key={r.id} 
                whileHover={{ x: 5 }}
                className="bg-slate-900/80 border-2 border-slate-800 p-8 rounded-[2.5rem] group hover:border-purple-500/50 transition-all relative shadow-xl"
              >
                <button 
                  onClick={() => r.id && deleteRule(r.id)}
                  className="absolute top-8 right-8 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={24} />
                </button>
                <h4 className="text-2xl font-black text-white mb-4">{r.title}</h4>
                <p className="text-slate-400 text-lg line-clamp-2 mb-6">{r.content}</p>
                {r.feedback && (
                  <div className="inline-flex items-center gap-2 bg-purple-500/10 px-4 py-2 rounded-xl border border-purple-500/20 text-xs font-black text-purple-400 uppercase tracking-widest">
                    <Sparkles size={14} /> AI Review Available
                  </div>
                )}
              </motion.div>
            ))}
            {rules.length === 0 && (
              <div className="py-32 text-center text-slate-600">
                <BookOpen size={64} className="mx-auto mb-6 opacity-10" />
                <p className="text-xl font-bold">No grammar rules in the vault yet.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AITutor = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);
    
    try {
      const prompt = `You are a professional English tutor. Answer the student's question in a helpful way, using Arabic for explanations if needed.
      Student: ${userMsg}`;
      
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setMessages(prev => [...prev, { role: 'ai', text: result.text || '' }]);
    } catch (error) {
      console.error('Chat failed:', error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-8 left-8 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-80 h-[500px] bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden mb-4"
          >
            <div className="bg-slate-800 p-5 flex justify-between items-center border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sky-500 rounded-full flex items-center justify-center text-white">
                  <GraduationCap size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white">AI Master Tutor</h4>
                  <p className="text-[8px] text-green-400 font-bold uppercase tracking-widest">Online</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <MessageSquare size={48} className="text-slate-500" />
                  <p className="text-xs text-slate-400 px-10">Ask me anything about English grammar, vocabulary, or pronunciation.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn(
                  "flex",
                  m.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  <div className={cn(
                    "max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed",
                    m.role === 'user' ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 px-4 py-3 rounded-2xl flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex gap-2">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your question..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-1 ring-sky-500"
              />
              <button 
                onClick={handleSend}
                className="bg-sky-500 hover:bg-sky-400 text-white p-2 rounded-xl transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95",
          isOpen ? "bg-slate-800 text-slate-400" : "bg-sky-500 text-white hover:scale-110"
        )}
      >
        {isOpen ? <X size={32} /> : <MessageSquare size={32} />}
      </button>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [points, setPoints] = useState(0);
  const [activeTab, setActiveTab] = useState<'vocabulary' | 'grammar' | 'whiteboard' | 'library' | 'study' | 'studio'>('vocabulary');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const wordsRef = collection(db, 'users', user.uid, 'wordbank');
    const unsub = onSnapshot(wordsRef, (s) => {
      const now = new Date();
      const count = s.docs.filter(d => {
        const data = d.data();
        if (!data.nextReviewDate) return false;
        const nextDate = data.nextReviewDate.toDate();
        return nextDate <= now;
      }).length;
      setDueCount(count);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  useEffect(() => {
    if (!user) return;
    const progressRef = doc(db, 'users', user.uid, 'userdata', 'progress');
    const unsub = onSnapshot(progressRef, (s) => {
      if (s.exists()) {
        setPoints(s.data().points || 0);
      } else {
        setDoc(progressRef, { points: 0, lastActive: serverTimestamp() });
      }
    });
    return () => unsub();
  }, [user]);

  const addPoints = async (p: number) => {
    if (!user) return;
    const progressRef = doc(db, 'users', user.uid, 'userdata', 'progress');
    await updateDoc(progressRef, { 
      points: points + p,
      lastActive: serverTimestamp()
    });
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="text-sky-500 animate-spin" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <BackgroundParticles />
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900/80 backdrop-blur-2xl border-4 border-sky-500/30 p-12 rounded-[3.5rem] shadow-[0_0_100px_-20px_rgba(14,165,233,0.4)] relative z-10"
        >
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-24 h-24 bg-gradient-to-br from-sky-500 to-blue-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl mx-auto mb-10"
          >
            <BrainCircuit size={50} />
          </motion.div>
          <h1 className="text-5xl font-black text-white mb-6 tracking-tighter">MASTER LAB</h1>
          <p className="text-slate-400 mb-12 leading-relaxed text-lg font-medium">
            The ultimate AI-powered RPG ecosystem for English mastery.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-slate-900 py-5 rounded-[1.5rem] font-black text-xl flex items-center justify-center gap-4 hover:bg-sky-50 transition-all active:scale-95 shadow-2xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-7 h-7" referrerPolicy="no-referrer" />
            ENTER THE LAB
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 font-sans selection:bg-sky-500/30 overflow-x-hidden relative">
      <BackgroundParticles />
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .font-arabic { font-family: 'Inter', sans-serif; direction: rtl; }
        
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0f1e]/80 backdrop-blur-xl border-b border-sky-500/20 p-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-500/30"
            >
              <BrainCircuit size={28} />
            </motion.div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tighter">MASTER LAB</h1>
              <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.3em]">Quest for Knowledge</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ y: -2 }}
              className="hidden md:flex items-center gap-3 bg-slate-900 border-2 border-yellow-500/30 px-5 py-2 rounded-2xl shadow-xl"
            >
              <Trophy size={20} className="text-yellow-500" />
              <div className="text-right">
                <p className="text-[8px] text-slate-500 font-black uppercase">XP Points</p>
                <p className="text-lg font-black text-white leading-none">{points}</p>
              </div>
            </motion.div>
            <div className="w-12 h-12 bg-slate-800 rounded-2xl border-2 border-slate-700 flex items-center justify-center text-slate-400 hover:border-sky-500 transition-colors cursor-pointer">
              <UserIcon size={24} />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="max-w-2xl mx-auto mt-10 px-4 relative z-10">
        <div className="bg-slate-900/90 border-2 border-slate-800 p-2 rounded-[2rem] flex items-center shadow-2xl">
            {[
              { id: 'vocabulary', icon: Sparkles, label: 'LAB' },
              { id: 'grammar', icon: PenTool, label: 'RULES' },
              { id: 'studio', icon: Layout, label: 'STUDIO' },
              { id: 'library', icon: History, label: 'VAULT' },
              { id: 'study', icon: BookOpen, label: 'STUDY' },
            ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 flex flex-col sm:flex-row items-center justify-center gap-2 py-4 rounded-2xl text-[10px] font-black transition-all duration-300 relative",
                activeTab === tab.id 
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30 scale-[1.05]" 
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              )}
            >
              <tab.icon size={18} />
              <span className="tracking-widest">{tab.label}</span>
              {tab.id === 'study' && dueCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-slate-900 animate-bounce">
                  {dueCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 pb-32 min-h-[calc(100vh-250px)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {user && (
              <>
                {activeTab === 'vocabulary' && <VocabularyLab user={user} onAddPoints={addPoints} />}
                {activeTab === 'grammar' && <GrammarWorkspace user={user} onAddPoints={addPoints} />}
                {activeTab === 'studio' && <NotionWorkspace user={user} />}
                {activeTab === 'library' && <Library user={user} />}
                {activeTab === 'study' && <FlashcardStudy user={user} onAddPoints={addPoints} />}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating UI */}
      <AITutor />

      {/* Mobile Points Bar */}
      <div className="md:hidden fixed bottom-8 right-8 z-50">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
          <Trophy size={20} className="text-yellow-500" />
          <div className="text-right">
            <p className="text-[8px] text-slate-500 font-black uppercase">Progress</p>
            <p className="text-sm font-black text-white">{points} pts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
