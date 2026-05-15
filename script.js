      // ── Provider state ──────────────────────────────────────────────
      let currentProvider = "claude";
      let abortController = null;

      const PROVIDER_NAMES = {
        claude: "Claude API",
        ollama: "Ollama",
        lmstudio: "LM Studio",
        custom: "Custom",
      };

      const MOTION = {
        quick: 140,
        state: 220,
        reveal: 260,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      };

      function prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }

      function animateElement(el, keyframes, options) {
        if (!el || prefersReducedMotion() || typeof el.animate !== "function") return null;
        const animation = el.animate(keyframes, {
          easing: MOTION.easing,
          fill: "both",
          ...options,
        });
        animation.addEventListener("finish", () => animation.cancel(), {
          once: true,
        });
        return animation;
      }

      function toggleSettings() {
        const panel = document.getElementById("providerSettings");
        const toggle = document.getElementById("settingsToggle");
        const isOpen = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!isOpen));
        toggle.setAttribute(
          "aria-label",
          isOpen ? "Open backend settings" : "Close backend settings",
        );

        if (isOpen) {
          const animation = animateElement(
            panel,
            [
              { opacity: 1, transform: "translateY(0) scale(1)" },
              { opacity: 0, transform: "translateY(-8px) scale(0.985)" },
            ],
            { duration: MOTION.quick },
          );
          if (animation) {
            animation.addEventListener(
              "finish",
              () => {
                panel.hidden = true;
              },
              { once: true },
            );
          } else {
            panel.hidden = true;
          }
          return;
        }

        panel.hidden = false;
        animateElement(
          panel,
          [
            { opacity: 0, transform: "translateY(-8px) scale(0.985)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: MOTION.reveal },
        );
      }

      function selectProvider(p) {
        currentProvider = p;
        document.querySelectorAll(".provider-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.provider === p);
          t.setAttribute("aria-pressed", String(t.dataset.provider === p));
        });
        ["claude", "ollama", "lmstudio", "custom"].forEach((id) => {
          const el = document.getElementById("config-" + id);
          const shouldShow = id === p;
          if (!shouldShow) {
            el.hidden = true;
            return;
          }
          if (el.hidden) {
            el.hidden = false;
            animateElement(
              el,
              [
                { opacity: 0, transform: "translateY(6px)" },
                { opacity: 1, transform: "translateY(0)" },
              ],
              { duration: MOTION.state },
            );
          }
        });
      }

      // Initialize: show Claude config by default
      selectProvider("claude");

      // ── Keyboard shortcuts ────────────────────────────────────────────
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.id === "problem" && !e.shiftKey) {
          e.preventDefault();
          const btn = document.getElementById("solveBtn");
          if (!btn.disabled) solve();
        }
        if (e.key === "?" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
          e.preventDefault();
          alert("Shortcuts: Enter in textarea to solve, Tab to navigate");
        }
      });

      // ── Connection tester ────────────────────────────────────────────
      function cancelSolve() {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        const btn = document.getElementById("solveBtn");
        btn.disabled = false;
        btnText.textContent = "Solve It";
        btn.querySelector(".btn-icon").textContent = "⚡";
        document.getElementById("cancelBtn").style.display = "none";
        const output = document.getElementById("output");
        output.style.display = "none";
        output.innerHTML = "";
        resetTitle();
      }

      async function testConnection(provider) {
        const dotEl = document.getElementById(provider + "-status");
        const txtEl = document.getElementById(provider + "-status-text");
        dotEl.className = "status-dot checking";
        txtEl.textContent = "Testing…";
        try {
          const { url, model, headers } = getProviderConfig(provider);
          const endpoint = url.replace(/\/$/, "") + "/chat/completions";
          const resp = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: model || "test",
              max_tokens: 5,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (resp.ok || resp.status === 400) {
            // 400 often means wrong model name but server is alive
            dotEl.className = "status-dot ok";
            txtEl.textContent = `Connected (HTTP ${resp.status})`;
          } else {
            throw new Error(`HTTP ${resp.status}`);
          }
        } catch (e) {
          dotEl.className = "status-dot err";
          txtEl.textContent = "Failed: " + (e.message || "unreachable");
        }
      }

      // ── Get config for provider ──────────────────────────────────────
      function getProviderConfig(provider) {
        if (provider === "ollama") {
          const base = document.getElementById("ollama-url").value.trim().replace(/\/$/, "");
          const model = document.getElementById("ollama-model").value.trim() || "llama3.2";
          return {
            url: base + "/v1",
            model,
            headers: { "Content-Type": "application/json" },
          };
        }
        if (provider === "lmstudio") {
          const base = document.getElementById("lmstudio-url").value.trim().replace(/\/$/, "");
          const model = document.getElementById("lmstudio-model").value.trim() || undefined;
          return {
            url: base + "/v1",
            model,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer lm-studio",
            },
          };
        }
        if (provider === "custom") {
          const base = document.getElementById("custom-url").value.trim().replace(/\/$/, "");
          const model = document.getElementById("custom-model").value.trim();
          const key = document.getElementById("custom-key").value.trim();
          const headers = { "Content-Type": "application/json" };
          if (key) headers["Authorization"] = "Bearer " + key;
          return { url: base, model, headers };
        }
        return null;
      }

      // ── Main solve function ──────────────────────────────────────────
      const EXAMPLES = [
        {
          name: "Two Sum",
          diff: "easy",
          problem: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.

Example 1:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]

Example 2:
Input: nums = [3,2,4], target = 6
Output: [1,2]

Constraints:
2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.`,
        },

        {
          name: "Longest Substring",
          diff: "medium",
          problem: `Given a string s, find the length of the longest substring without repeating characters.

Example 1:
Input: s = "abcabcbb"
Output: 3 (The answer is "abc")

Example 2:
Input: s = "bbbbb"
Output: 1

Constraints:
0 <= s.length <= 5 * 10^4
s consists of English letters, digits, symbols and spaces.`,
        },

        {
          name: "Merge Intervals",
          diff: "medium",
          problem: `Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.

Example:
Input: intervals = [[1,3],[2,6],[8,10],[15,18]]
Output: [[1,6],[8,10],[15,18]]

Constraints:
1 <= intervals.length <= 10^4
intervals[i].length == 2
0 <= start_i <= end_i <= 10^4`,
        },

        {
          name: "Word Ladder",
          diff: "hard",
          problem: `A transformation sequence from word beginWord to word endWord using a dictionary wordList is a sequence beginWord -> s1 -> s2 -> ... -> sk such that every adjacent pair differs by a single letter, every si is in wordList, and sk == endWord.

Given two words, beginWord and endWord, and a dictionary wordList, return the number of words in the shortest transformation sequence, or 0 if no such sequence exists.

Example:
Input: beginWord = "hit", endWord = "cog", wordList = ["hot","dot","dog","lot","log","cog"]
Output: 5

Constraints:
1 <= beginWord.length <= 10
endWord.length == beginWord.length
1 <= wordList.length <= 5000`,
        },

        {
          name: "LRU Cache",
          diff: "medium",
          problem: `Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.

Implement the LRUCache class:
- LRUCache(int capacity) Initialize the LRU cache with positive size capacity.
- int get(int key) Return the value of the key if it exists, otherwise return -1.
- void put(int key, int value) Update the value if key exists. Otherwise, add the key-value pair to the cache. If the number of keys exceeds capacity, evict the least recently used key.

Both functions must run in O(1) average time complexity.

Constraints: 1 <= capacity <= 3000, 0 <= key <= 10^4`,
        },
      ];

      // Render example chips
      const examplesEl = document.getElementById("examples");
      EXAMPLES.forEach((ex) => {
        const chip = document.createElement("button");
        chip.className = "example-chip";
        chip.innerHTML = `${ex.name} <span class="diff-badge ${ex.diff}">${ex.diff}</span>`;
        chip.onclick = () => {
          document.getElementById("problem").value = ex.problem;
          const inputSection = document.querySelector(".input-section");
          inputSection.classList.remove("populated");
          void inputSection.offsetWidth;
          inputSection.classList.add("populated");
          setTimeout(() => {
            inputSection.classList.remove("populated");
          }, 600);
        };
        examplesEl.appendChild(chip);
      });

      // ── Animated title (visible when user is on another tab) ──────────
      const ORIGINAL_TITLE = document.title;
      document.title = ORIGINAL_TITLE;
      let titleInterval = null;

      function startAnalyzingTitle() {
        const frames = ["|", "/", "-", "\\"];
        let i = 0;
        titleInterval = setInterval(() => {
          document.title = "LeetCode Coach — Analyzing " + frames[i++ % frames.length];
        }, 120);
      }

      function stopAnalyzingTitle(isError) {
        if (titleInterval) {
          clearInterval(titleInterval);
          titleInterval = null;
        }
        document.title = isError ? "LeetCode Coach — err" : "LeetCode Coach — done";
        setTimeout(() => {
          document.title = ORIGINAL_TITLE;
        }, 3000);
      }

      function resetTitle() {
        if (titleInterval) {
          clearInterval(titleInterval);
          titleInterval = null;
        }
        document.title = ORIGINAL_TITLE;
      }

      async function solve() {
        const problem = document.getElementById("problem").value.trim();
        const lang = document.getElementById("lang").value;
        const btn = document.getElementById("solveBtn");
        const btnText = document.getElementById("btnText");

        if (!problem) {
          const problemInput = document.getElementById("problem");
          const inputSection = document.querySelector(".input-section");
          problemInput.focus();
          inputSection.classList.remove("needs-problem");
          void inputSection.offsetWidth;
          inputSection.classList.add("needs-problem");
          btnText.textContent = "Add a problem first";
          setTimeout(() => {
            btnText.textContent = "Solve It";
            inputSection.classList.remove("needs-problem");
          }, 1500);
          return;
        }

        btn.disabled = true;
        btnText.textContent = "Analyzing…";
        btn.querySelector(".btn-icon").innerHTML = '<div class="spinner"></div>';
        document.getElementById("cancelBtn").style.display = "inline-flex";
        startAnalyzingTitle();

        if (abortController) abortController.abort();
        abortController = new AbortController();
        const signal = abortController.signal;

        const output = document.getElementById("output");
        output.style.display = "none";
        output.innerHTML = "";

        const systemPrompt = `You are an expert LeetCode coach and coding interview specialist. Analyze the problem and produce a complete solution breakdown in strict JSON format only. No markdown fences, no preamble, no commentary. Return ONLY valid JSON with exactly these keys:
{
  "understanding": "clear explanation of what the problem asks",
  "approach": "the optimal algorithm idea and why it works",
  "algorithm": ["step 1", "step 2", "step 3"],
  "code": "the complete ${lang} code with no markdown",
  "explanation": [{"line": "code snippet", "meaning": "what it does"}],
  "dryrun": {"description": "walkthrough narrative", "table": [{"step": "1", "var1": "val", "action": "desc"}]},
  "complexity": {"time": "O(...)", "time_reason": "why", "space": "O(...)", "space_reason": "why"},
  "edge_cases": [{"case": "description", "handling": "how the code handles it"}]
}
The dry run table headers should match key variable names. Include 3-6 rows.`;

        const userPrompt = `Solve this problem in ${lang}:\n\n${problem}`;

        try {
          let raw = "";

          if (currentProvider === "claude") {
            // ── Anthropic native API ──────────────────────────────────
            const model = document.getElementById("claude-model").value;
            const response = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal,
              body: JSON.stringify({
                model,
                max_tokens: 1000,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
              }),
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            raw = data.content.map((b) => b.text || "").join("");
          } else {
            // ── OpenAI-compatible API (Ollama / LM Studio / Custom) ──
            const cfg = getProviderConfig(currentProvider);
            if (!cfg.url || cfg.url === "/v1")
              throw new Error(
                "Please configure the Base URL for " + PROVIDER_NAMES[currentProvider],
              );
            const endpoint = cfg.url.replace(/\/$/, "") + "/chat/completions";

            const body = {
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              max_tokens: 4096,
              temperature: 0.2,
              stream: false,
            };
            if (cfg.model) body.model = cfg.model;

            const response = await fetch(endpoint, {
              method: "POST",
              headers: cfg.headers,
              signal,
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              const errText = await response.text().catch(() => "");
              let msg = `HTTP ${response.status}`;
              try {
                msg = JSON.parse(errText).error?.message || msg;
              } catch {}
              throw new Error(msg);
            }

            const data = await response.json();
            raw = data.choices?.[0]?.message?.content || "";
            if (!raw) throw new Error("Empty response from model. Is a model loaded/running?");
          }

          // ── Parse JSON from response ─────────────────────────────────
          let cleaned = raw
            .replace(/```json[\s\S]*?```/g, (m) => m.replace(/```json|```/g, ""))
            .replace(/```/g, "")
            .trim();
          // Extract first { ... } block in case model prefixed text
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (!jsonMatch)
            throw new Error("Model did not return valid JSON. Try a larger/smarter model.");
          const parsed = JSON.parse(jsonMatch[0]);

          renderOutput(parsed, lang);
          stopAnalyzingTitle(false);
        } catch (err) {
          if (err.name === "AbortError") {
            resetTitle();
            output.style.display = "none";
            output.innerHTML = "";
            return;
          }
          output.style.display = "block";
          const isLocal = currentProvider !== "claude";
          const hint = isLocal
            ? `<br><span style="color:var(--muted);font-size:var(--text-xs)">Tip: Make sure your local server is running and CORS is allowed. Use the "Test Connection" button above.</span>`
            : "";
          output.innerHTML = `<div class="error-box">⚠️ ${escHtml(err.message || "Something went wrong.")}${hint}</div>`;
          stopAnalyzingTitle(true);
        } finally {
          abortController = null;
          document.getElementById("cancelBtn").style.display = "none";
          btn.disabled = false;
          btnText.textContent = "Solve It";
          btn.querySelector(".btn-icon").textContent = "⚡";
        }
      }

      async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy command was blocked");
      }

      const renderedCodeSnippets = [];

      async function copyCode(btn) {
        const code = renderedCodeSnippets[Number(btn.dataset.codeIndex)] || "";
        try {
          await copyText(code);
          btn.classList.remove("copy-failed");
          btn.classList.remove("copied");
          void btn.offsetWidth;
          btn.classList.add("copied");
          btn.textContent = "✓ Copied!";
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.textContent = "Copy";
          }, 2000);
        } catch {
          btn.classList.remove("copied");
          btn.classList.add("copy-failed");
          btn.textContent = "Copy failed";
          setTimeout(() => {
            btn.classList.remove("copy-failed");
            btn.textContent = "Copy";
          }, 2200);
        }
      }

      function renderOutput(d, lang) {
        const output = document.getElementById("output");
        output.style.display = "block";
        renderedCodeSnippets.length = 0;

        const sections = [
          {
            cls: "s-understanding",
            icon: "🔍",
            title: "Problem Understanding",
            content: () => `<p>${escHtml(d.understanding)}</p>`,
          },
          {
            cls: "s-approach",
            icon: "💡",
            title: "Approach",
            content: () => `<p>${escHtml(d.approach)}</p>`,
          },
          {
            cls: "s-algorithm",
            icon: "🗂",
            title: "Algorithm",
            content: () => {
              const steps = (d.algorithm || [])
                .map(
                  (s, i) => `
          <li class="algo-step">
            <div class="step-num">${i + 1}</div>
            <div>${escHtml(s)}</div>
          </li>`,
                )
                .join("");
              return `<ul class="algo-steps">${steps}</ul>`;
            },
          },
          {
            cls: "s-code",
            icon: "💻",
            title: `Solution · ${lang}`,
            content: () => {
              const code = d.code || "";
              const codeIndex = renderedCodeSnippets.push(code) - 1;
              return `<div class="code-wrap">
          <div class="code-toolbar">
            <button class="copy-btn" type="button" data-code-index="${codeIndex}" onclick="copyCode(this)">Copy</button>
          </div>
          <pre class="code-block">${escHtml(code)}</pre>
        </div>`;
            },
          },
          {
            cls: "s-explain",
            icon: "📝",
            title: "Line-by-Line Explanation",
            content: () => {
              const lines = (d.explanation || [])
                .map(
                  (e) => `
          <div class="explain-line">
            <code>${escHtml(e.line || "")}</code>
            <p class="explain-meaning">${escHtml(e.meaning || "")}</p>
          </div>`,
                )
                .join("");
              return `<div class="explain-list">${lines}</div>`;
            },
          },
          {
            cls: "s-dryrun",
            icon: "🔄",
            title: "Dry Run",
            content: () => {
              let html = `<p class="dry-description">${escHtml((d.dryrun || {}).description || "")}</p>`;
              const table = (d.dryrun || {}).table || [];
              if (table.length > 0) {
                const headers = Object.keys(table[0]);
                html += `<div class="dry-table-wrap"><table>
            <thead><tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${table.map((row) => `<tr>${headers.map((h) => `<td>${escHtml(String(row[h] || ""))}</td>`).join("")}</tr>`).join("")}</tbody>
          </table></div>`;
              }
              return html;
            },
          },
          {
            cls: "s-complexity",
            icon: "📊",
            title: "Complexity",
            content: () => {
              const c = d.complexity || {};
              return `<div class="complexity-pills">
          <div class="cpill">
            <div>
              <div class="cpill-label">Time</div>
              <div class="cpill-value">${escHtml(c.time || "")}</div>
              <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${escHtml(c.time_reason || "")}</div>
            </div>
          </div>
          <div class="cpill">
            <div>
              <div class="cpill-label">Space</div>
              <div class="cpill-value">${escHtml(c.space || "")}</div>
              <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${escHtml(c.space_reason || "")}</div>
            </div>
          </div>
        </div>`;
            },
          },
          {
            cls: "s-edge",
            icon: "⚠️",
            title: "Edge Cases",
            content: () => {
              const items = (d.edge_cases || [])
                .map(
                  (e) => `
          <div class="edge-item">
            <div class="edge-bullet">◆</div>
            <div class="edge-title">${escHtml(e.case || "")}</div>
            <p class="edge-handling">${escHtml(e.handling || "")}</p>
          </div>`,
                )
                .join("");
              return `<div class="edge-list">${items}</div>`;
            },
          },
        ];

        output.innerHTML = sections
          .map(
            (s, i) => `
	    <div class="section-card ${s.cls}" id="section-${i}">
	      <div class="section-header">
	        <div class="section-icon">${s.icon}</div>
	        <div class="section-title">${s.title}</div>
	      </div>
	      <div class="section-body" id="section-body-${i}">${s.content()}</div>
	    </div>
	  `,
          )
          .join("");
      }

      function escHtml(str) {
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
