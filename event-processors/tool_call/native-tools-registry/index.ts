import type { Tool } from "@/interfaces/index.ts";

import ask_question from "./ask_question.ts";
import create_thread from "./create_thread.ts";
import end_thread from "./end_thread.ts";
import create_task from "./create_task.ts";
import http_request from "./http_request.ts";
import read_file from "./read_file.ts";
import write_file from "./write_file.ts";
import list_directory from "./list_directory.ts";
import verbal_pause from "./verbal_pause.ts";
import get_current_time from "./get_current_time.ts";
import search_files from "./search_files.ts";
import fetch_text from "./fetch_text.ts";
import run_command from "./run_command.ts";
import wait from "./wait.ts";

export const nativeTools: { [key: string]: Tool } = {
    ask_question,
    create_thread,
    end_thread,
    create_task,
    http_request,
    read_file,
    write_file,
    list_directory,
    verbal_pause,
    get_current_time,
    search_files,
    fetch_text,
    run_command,
    wait
};

export function getNativeTools(): { [key: string]: Tool } {
    return nativeTools;
}
