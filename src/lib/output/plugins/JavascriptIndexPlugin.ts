import * as Path from "path";
import { Builder, trimmer } from "lunr";

import {
    DeclarationReflection,
    ProjectReflection,
    ReflectionKind,
} from "../../models";
import { GroupPlugin } from "../../converter/plugins";
import { Component, RendererComponent } from "../components";
import { RendererEvent } from "../events";
import { writeFileSync } from "../../utils";
import { DefaultTheme } from "../themes/default/DefaultTheme";

/**
 * A plugin that exports an index of the project to a javascript file.
 *
 * The resulting javascript file can be used to build a simple search function.
 */
@Component({ name: "javascript-index" })
export class JavascriptIndexPlugin extends RendererComponent {
    /**
     * Create a new JavascriptIndexPlugin instance.
     */
    override initialize() {
        this.listenTo(this.owner, RendererEvent.BEGIN, this.onRendererBegin);
    }

    /**
     * Triggered after a document has been rendered, just before it is written to disc.
     *
     * @param event  An event object describing the current render operation.
     */
    private onRendererBegin(event: RendererEvent) {
        if (!(this.owner.theme instanceof DefaultTheme)) {
            return;
        }
        if (event.isDefaultPrevented) {
            return;
        }

        const rows: any[] = [];
        const kinds: { [K in ReflectionKind]?: string } = {};

        for (const reflection of event.project.getReflectionsByKind(
            ReflectionKind.All
        )) {
            if (!(reflection instanceof DeclarationReflection)) {
                continue;
            }

            if (
                !reflection.url ||
                !reflection.name ||
                reflection.flags.isExternal
            ) {
                continue;
            }

            let parent = reflection.parent;
            const boost = reflection.relevanceBoost ?? 1;
            if (boost <= 0) {
                continue;
            }

            if (parent instanceof ProjectReflection) {
                parent = undefined;
            }

            if (!kinds[reflection.kind]) {
                kinds[reflection.kind] = GroupPlugin.getKindSingular(
                    reflection.kind
                );
            }

            const row: any = {
                id: rows.length,
                kind: reflection.kind,
                name: reflection.name,
                url: reflection.url,
                classes: reflection.cssClasses,
            };

            if (boost !== 1) {
                row.boost = boost;
            }

            if (parent) {
                row.parent = parent.getFullName();
            }

            rows.push(row);
        }

        const builder = new Builder();
        builder.pipeline.add(trimmer);

        builder.ref("id");
        builder.field("name", { boost: 10 });
        builder.field("parent");

        rows.forEach((row) => builder.add(row));

        const index = builder.build();

        const jsonFileName = Path.join(
            event.outputDirectory,
            "assets",
            "search.js"
        );

        const jsonData = JSON.stringify({
            kinds,
            rows,
            index,
        });

        writeFileSync(
            jsonFileName,
            `window.searchData = JSON.parse(${JSON.stringify(jsonData)});`
        );
    }
}
